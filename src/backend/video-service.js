const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');

// Set path binary
const cleanFfmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
const cleanFfprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');

ffmpeg.setFfmpegPath(cleanFfmpegPath);
ffmpeg.setFfprobePath(cleanFfprobePath);

/**
 * Helper: Get video duration in seconds
 */
function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const duration = metadata.format.duration;
            resolve(parseFloat(duration));
        });
    });
}

/**
 * Helper: Generate a physical silent audio file (10 seconds)
 */
function generateSilentFile(outputPath) {
    return new Promise((resolve, reject) => {
        // Use a simple lavfi command to generate silence
        const args = [
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-t', '10',
            '-c:a', 'aac',
            '-y', outputPath
        ];

        execFile(cleanFfmpegPath, args, (error, stdout, stderr) => {
            if (error) {
                console.error("Error creating silent file:", stderr);
                // Fallback: create a dummy file using a different method if lavfi fails system-wide
                // But usually lavfi works for generation if not in complex filter
                reject(error);
            } else {
                resolve(outputPath);
            }
        });
    });
}

/**
 * Helper: Add silent audio track to a video file using a physical silent file
 */
function addSilentAudio(inputPath, silentAudioPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(inputPath)
            .input(silentAudioPath)
            .outputOptions([
                '-map 0:v',     // Take video from input 0
                '-map 1:a',     // Take audio from input 1 (silent file)
                '-c:v copy',    // Copy video stream (fast)
                '-c:a aac',     // Encode audio
                '-shortest'     // Cut to shortest stream (video duration)
            ])
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => {
                console.error("Merge silence failed:", err);
                reject(err);
            });
    });
}

/**
 * Helper: Check audio stream
 */
function hasAudioStream(filePath) {
    return new Promise((resolve) => {
        execFile(cleanFfmpegPath, ['-i', filePath], (error, stdout, stderr) => {
            const output = stderr || stdout || '';
            resolve(/Stream #\d+:\d+.*Audio:/.test(output));
        });
    });
}

/**
 * MAIN FUNCTION: Join with XFADE Transitions
 */
async function processJoinVideo(videoFiles, voiceFile, backsoundFile, useBacksound) {
    const tempDir = path.join(os.tmpdir(), 'fashion-ai-video-proc', uuidv4());
    await fs.ensureDir(tempDir);

    let processedVideos = []; // Array of { path, duration }
    let voicePath = null;
    let backsoundPath = null;
    const silenceSourcePath = path.join(tempDir, 'silence_source.m4a');
    const outputPath = path.join(tempDir, 'output_final.mp4');
    const TRANSITION_DURATION = 1; // Durasi transisi 1 detik

    try {
        console.log(`[VideoService] Processing ${videoFiles.length} videos with transitions...`);

        // 0. Generate Master Silence
        try {
            await generateSilentFile(silenceSourcePath);
        } catch (e) {
            // Fatal if we can't make silence, as join will fail on silent videos
            throw new Error("Failed to initialize audio generator.");
        }

        // 1. Prepare Videos (Save, Check Audio, Get Duration)
        for (let i = 0; i < videoFiles.length; i++) {
            const origPath = path.join(tempDir, `video_orig_${i}.mp4`);
            const fixedPath = path.join(tempDir, `video_fixed_${i}.mp4`);

            await fs.writeFile(origPath, Buffer.from(videoFiles[i].data, 'base64'));

            let finalVideoPath = origPath;
            const hasAudio = await hasAudioStream(origPath);

            if (!hasAudio) {
                console.log(`Video ${i} no audio, adding silence.`);
                try {
                    await addSilentAudio(origPath, silenceSourcePath, fixedPath);
                    finalVideoPath = fixedPath;
                } catch (e) {
                    console.error(`Failed to fix audio for video ${i}.`, e);
                    // If fix fails, we might crash later, but let's proceed with orig
                }
            }

            const duration = await getVideoDuration(finalVideoPath);
            processedVideos.push({ path: finalVideoPath, duration: duration });
        }

        // 2. Save Extra Audio
        if (voiceFile?.data) {
            voicePath = path.join(tempDir, 'voice.mp3');
            await fs.writeFile(voicePath, Buffer.from(voiceFile.data, 'base64'));
        }
        if (useBacksound && backsoundFile?.data) {
            backsoundPath = path.join(tempDir, 'backsound.mp3');
            await fs.writeFile(backsoundPath, Buffer.from(backsoundFile.data, 'base64'));
        }

        // 3. Build FFmpeg Command with XFADE
        return new Promise((resolve, reject) => {
            let command = ffmpeg();
            processedVideos.forEach(v => command.input(v.path));

            const filterComplex = [];
            const count = processedVideos.length;

            // --- A. Normalize Inputs ---
            // Scale all to 720x1280, reset PTS, resample audio
            // Added 'fps=30' to ensure common frame rate for xfade
            for (let i = 0; i < count; i++) {
                filterComplex.push(`[${i}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
                filterComplex.push(`[${i}:a]aresample=44100,asetpts=PTS-STARTPTS[a${i}]`);
            }

            // --- B. XFADE Logic ---
            let currentOffset = 0;
            let vLabel = '[v0]';
            let aLabel = '[a0]';

            for (let i = 1; i < count; i++) {
                const prevDuration = processedVideos[i-1].duration;

                // Offset Logic
                // Simplification: We assume videos overlap by TRANSITION_DURATION
                // So next video starts at: current_end - transition_duration

                currentOffset += prevDuration - TRANSITION_DURATION;

                // Safety check: if video is shorter than transition, force offset
                if (currentOffset < 0) currentOffset = 0;

                const nextV = `[v${i}]`;
                const nextA = `[a${i}]`;
                const targetV = `[v_out${i}]`;
                const targetA = `[a_out${i}]`;

                // Video Transition (fade)
                filterComplex.push(`${vLabel}${nextV}xfade=transition=fade:duration=${TRANSITION_DURATION}:offset=${currentOffset}${targetV}`);

                // Audio Transition (crossfade)
                filterComplex.push(`${aLabel}${nextA}acrossfade=d=${TRANSITION_DURATION}:c1=tri:c2=tri${targetA}`);

                // Update label for next iteration
                vLabel = targetV;
                aLabel = targetA;
            }

            // Final Labels
            const finalV = count > 1 ? vLabel : '[v0]';
            const finalA_raw = count > 1 ? aLabel : '[a0]';

            // --- C. Mix Extra Audio ---
            let nextInputIndex = count;
            let mixInputs = [finalA_raw];
            let mixCount = 1;

            if (voicePath) {
                command.input(voicePath);
                filterComplex.push(`[${nextInputIndex}:a]volume=1.5[voice_norm]`);
                mixInputs.push('[voice_norm]');
                nextInputIndex++;
                mixCount++;
            }
            if (backsoundPath) {
                command.input(backsoundPath);
                filterComplex.push(`[${nextInputIndex}:a]volume=0.15[bgm_norm]`);
                mixInputs.push('[bgm_norm]');
                nextInputIndex++;
                mixCount++;
            }

            if (mixCount > 1) {
                filterComplex.push(`${mixInputs.join('')}amix=inputs=${mixCount}:duration=first:dropout_transition=2[final_audio]`);
            } else {
                filterComplex.push(`${finalA_raw}volume=1.0[final_audio]`);
            }

            // --- EXECUTE ---
            command
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map', finalV,
                    '-map', '[final_audio]',
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-c:a', 'aac',
                    '-shortest'
                ])
                .save(outputPath)
                .on('start', (cmd) => console.log('FFmpeg XFADE Started:', cmd))
                .on('error', (err) => {
                    console.error('FFmpeg XFADE Error:', err);
                    reject(err);
                })
                .on('end', async () => {
                    console.log('FFmpeg XFADE Finished');
                    try {
                        const buf = await fs.readFile(outputPath);
                        const b64 = buf.toString('base64');
                        await fs.remove(tempDir);
                        resolve(b64);
                    } catch (e) { reject(e); }
                });
        });

    } catch (error) {
        await fs.remove(tempDir).catch(() => {});
        throw error;
    }
}

module.exports = { processJoinVideo };
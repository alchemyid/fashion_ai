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
        const args = [
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-t', '10',
            '-c:a', 'aac',
            '-y', outputPath
        ];

        execFile(cleanFfmpegPath, args, (error, stdout, stderr) => {
            if (error) {
                console.error("Error creating silent file:", stderr);
                reject(error);
            } else {
                resolve(outputPath);
            }
        });
    });
}

/**
 * Helper: Add silent audio track to a video file
 */
function addSilentAudio(inputPath, silentAudioPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(inputPath)
            .input(silentAudioPath)
            .outputOptions([
                '-map 0:v',
                '-map 1:a',
                '-c:v copy',
                '-c:a aac',
                '-shortest'
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
 * MAIN FUNCTION: Join with XFADE Transitions + Audio Mixing + Watermark
 */
async function processJoinVideo(videoFiles, voiceFile, backsoundFile, useBacksound, watermark) {
    const tempDir = path.join(os.tmpdir(), 'fashion-ai-video-proc', uuidv4());
    await fs.ensureDir(tempDir);

    let processedVideos = [];
    let voicePath = null;
    let backsoundPath = null;
    let watermarkPath = null;

    const silenceSourcePath = path.join(tempDir, 'silence_source.m4a');
    const outputPath = path.join(tempDir, 'output_final.mp4');
    const TRANSITION_DURATION = 0.5;

    try {
        console.log(`[VideoService] Processing ${videoFiles.length} videos...`);

        // 0. Generate Master Silence
        try {
            await generateSilentFile(silenceSourcePath);
        } catch (e) {
            throw new Error("Failed to initialize audio generator.");
        }

        // 1. Prepare Videos
        for (let i = 0; i < videoFiles.length; i++) {
            const origPath = path.join(tempDir, `video_orig_${i}.mp4`);
            const fixedPath = path.join(tempDir, `video_fixed_${i}.mp4`);

            await fs.writeFile(origPath, Buffer.from(videoFiles[i].data, 'base64'));

            let finalVideoPath = origPath;
            const hasAudio = await hasAudioStream(origPath);

            if (!hasAudio) {
                try {
                    await addSilentAudio(origPath, silenceSourcePath, fixedPath);
                    finalVideoPath = fixedPath;
                } catch (e) {
                    console.error(`Failed to fix audio for video ${i}.`, e);
                }
            }

            const duration = await getVideoDuration(finalVideoPath);
            processedVideos.push({ path: finalVideoPath, duration: duration });
        }

        // 2. Save Extra Files
        if (voiceFile?.data) {
            voicePath = path.join(tempDir, 'voice.mp3');
            await fs.writeFile(voicePath, Buffer.from(voiceFile.data, 'base64'));
        }
        if (useBacksound && backsoundFile?.data) {
            backsoundPath = path.join(tempDir, 'backsound.mp3');
            await fs.writeFile(backsoundPath, Buffer.from(backsoundFile.data, 'base64'));
        }
        if (watermark?.data) {
            watermarkPath = path.join(tempDir, 'watermark_img.png');
            await fs.writeFile(watermarkPath, Buffer.from(watermark.data, 'base64'));
        }

        // 3. Build FFmpeg Command
        return new Promise((resolve, reject) => {
            let command = ffmpeg();

            // Input Video Files
            processedVideos.forEach(v => command.input(v.path));

            const filterComplex = [];
            const count = processedVideos.length;

            // --- A. Normalize Inputs ---
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
                currentOffset += prevDuration - TRANSITION_DURATION;
                if (currentOffset < 0) currentOffset = 0;
                const offset = currentOffset;

                const nextV = `[v${i}]`;
                const nextA = `[a${i}]`;
                const targetV = `[v_out${i}]`;
                const targetA = `[a_out${i}]`;

                filterComplex.push(`${vLabel}${nextV}xfade=transition=fade:duration=${TRANSITION_DURATION}:offset=${offset}${targetV}`);
                filterComplex.push(`${aLabel}${nextA}acrossfade=d=${TRANSITION_DURATION}:c1=tri:c2=tri${targetA}`);

                vLabel = targetV;
                aLabel = targetA;
            }

            const finalV_joined = count > 1 ? vLabel : '[v0]';
            const finalA_raw = count > 1 ? aLabel : '[a0]';

            let nextInputIndex = count; // Index input selanjutnya

            // --- C. Watermark Logic ---
            let finalV_output = finalV_joined;

            if (watermarkPath) {
                // Fix loop issue explicitly
                command.addInput(watermarkPath).inputOptions(['-loop 1']);

                const wmIndex = nextInputIndex;
                nextInputIndex++;

                const opacityFactor = (watermark.opacity || 100) / 100;
                // Get size from watermark param or default to 200
                const wmSize = watermark.size || 200;

                let overlayCoord = "";
                switch (watermark.position) {
                    case 'top_left': overlayCoord = "x=20:y=20"; break;
                    case 'top_right': overlayCoord = "x=main_w-overlay_w-20:y=20"; break;
                    case 'bottom_left': overlayCoord = "x=20:y=main_h-overlay_h-20"; break;
                    case 'bottom_right': overlayCoord = "x=main_w-overlay_w-20:y=main_h-overlay_h-20"; break;
                    case 'center': overlayCoord = "x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2"; break;
                    default: overlayCoord = "x=main_w-overlay_w-20:y=main_h-overlay_h-20";
                }

                // PENTING: scale=SIZE:-1:flags=lanczos,format=rgba
                // Menggunakan format=rgba menjaga alpha channel agar tidak hilang saat di-resize
                filterComplex.push(`[${wmIndex}:v]scale=${wmSize}:-1:flags=lanczos,format=rgba,colorchannelmixer=aa=${opacityFactor}[wm_ready]`);
                filterComplex.push(`${finalV_joined}[wm_ready]overlay=${overlayCoord}:format=auto[v_watermarked]`);

                finalV_output = '[v_watermarked]';
            }

            // --- D. Audio Mixing ---
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
                    '-map', finalV_output,
                    '-map', '[final_audio]',
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-c:a', 'aac',
                    '-pix_fmt', 'yuv420p', // Penting untuk kompatibilitas player
                    '-shortest'
                ])
                .save(outputPath)
                .on('start', (cmd) => console.log('FFmpeg Started:', cmd))
                .on('error', (err) => {
                    console.error('FFmpeg Error:', err);
                    reject(err);
                })
                .on('end', async () => {
                    console.log('FFmpeg Finished');
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
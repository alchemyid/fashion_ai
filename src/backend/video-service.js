const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');

// Set path binary FFmpeg
const cleanFfmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
ffmpeg.setFfmpegPath(cleanFfmpegPath);

/**
 * Helper: Check if file has audio stream using ffprobe/ffmpeg
 */
function hasAudioStream(filePath) {
    return new Promise((resolve) => {
        execFile(cleanFfmpegPath, ['-i', filePath], (error, stdout, stderr) => {
            const output = stderr || stdout || '';
            const hasAudio = /Stream #\d+:\d+.*Audio:/.test(output);
            resolve(hasAudio);
        });
    });
}

/**
 * Helper: Generate a physical silent audio file (10 seconds)
 * This is safer than using lavfi/aevalsrc inside complex filters.
 */
function generateSilentFile(outputPath) {
    return new Promise((resolve, reject) => {
        // Using -f lavfi -i anullsrc is the standard CLI way.
        // If that fails, we can try a simpler approach or assumes lavfi works as input format but not inside filter_complex
        const args = [
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-t', '10', // 10 seconds duration
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
 * Main Function: Join Video
 */
async function processJoinVideo(videoFiles, voiceFile, backsoundFile, useBacksound) {
    const tempDir = path.join(os.tmpdir(), 'fashion-ai-video-proc', uuidv4());
    await fs.ensureDir(tempDir);

    let inputVideoPaths = [];
    let voicePath = null;
    let backsoundPath = null;
    // Path for a shared silent audio source file
    const silenceSourcePath = path.join(tempDir, 'silence_source.m4a');
    const outputPath = path.join(tempDir, 'output_final.mp4');

    try {
        console.log(`[VideoService] Processing ${videoFiles.length} videos in: ${tempDir}`);

        // 0. Generate a silent audio file once
        try {
            await generateSilentFile(silenceSourcePath);
        } catch (e) {
            console.error("Failed to generate silence file. FFmpeg lavfi issue?");
            throw new Error("System FFmpeg cannot generate silence. " + e.message);
        }

        // 1. Save Video Files & Pre-process (Check Audio)
        for (let i = 0; i < videoFiles.length; i++) {
            const originalPath = path.join(tempDir, `video_orig_${i}.mp4`);
            const finalPath = path.join(tempDir, `video_${i}.mp4`);

            // Write base64 to disk
            await fs.writeFile(originalPath, Buffer.from(videoFiles[i].data, 'base64'));

            // Check audio
            const hasAudio = await hasAudioStream(originalPath);

            if (hasAudio) {
                inputVideoPaths.push(originalPath);
            } else {
                console.log(`[VideoService] Video ${i} has no audio. Adding silence...`);
                try {
                    // Merge original video with the pre-generated silent file
                    await addSilentAudio(originalPath, silenceSourcePath, finalPath);
                    inputVideoPaths.push(finalPath);
                } catch (e) {
                    console.error(`Failed to add silence to video ${i}, using original. Join might fail.`, e);
                    inputVideoPaths.push(originalPath);
                }
            }
        }

        // 2. Save Voice File
        if (voiceFile && voiceFile.data) {
            voicePath = path.join(tempDir, 'voice.mp3');
            await fs.writeFile(voicePath, Buffer.from(voiceFile.data, 'base64'));
        }

        // 3. Save Backsound File
        // Logic update: useBacksound is passed as true/false from frontend based on file presence
        if (useBacksound && backsoundFile && backsoundFile.data) {
            backsoundPath = path.join(tempDir, 'backsound.mp3');
            await fs.writeFile(backsoundPath, Buffer.from(backsoundFile.data, 'base64'));
        }

        // 4. Execute FFmpeg Join
        return new Promise((resolve, reject) => {
            let command = ffmpeg();

            // Input Videos
            inputVideoPaths.forEach(vidPath => command.input(vidPath));

            const complexFilter = [];
            const videoCount = inputVideoPaths.length;

            // A. Normalize Videos (Scale & Sample Rate)
            for (let i = 0; i < videoCount; i++) {
                // Scale to 720x1280 (Portrait) & Normalize Audio
                complexFilter.push(`[${i}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS[v${i}]`);
                complexFilter.push(`[${i}:a]aresample=44100,asetpts=PTS-STARTPTS[a${i}]`);
            }

            // B. Concatenate
            let concatInputStr = '';
            for (let i = 0; i < videoCount; i++) {
                concatInputStr += `[v${i}][a${i}]`;
            }
            complexFilter.push(`${concatInputStr}concat=n=${videoCount}:v=1:a=1[vconc][aconc_raw]`);

            // C. Audio Mixing
            let audioMixInputs = ['[aconc_raw]'];
            let nextInputIndex = videoCount;
            let inputsToMix = 1; // Base is always the video audio (which we ensured exists)

            if (voicePath) {
                command.input(voicePath);
                complexFilter.push(`[${nextInputIndex}:a]volume=1.5[voice_norm]`);
                audioMixInputs.push('[voice_norm]');
                nextInputIndex++;
                inputsToMix++;
            }

            if (backsoundPath) {
                command.input(backsoundPath);
                complexFilter.push(`[${nextInputIndex}:a]volume=0.15[bgm_norm]`);
                audioMixInputs.push('[bgm_norm]');
                nextInputIndex++;
                inputsToMix++;
            }

            // Decide Output Audio
            if (inputsToMix > 1) {
                complexFilter.push(`${audioMixInputs.join('')}amix=inputs=${inputsToMix}:duration=first:dropout_transition=2[aout]`);
            } else {
                // Simple rename if no mixing needed
                complexFilter.push(`[aconc_raw]volume=1.0[aout]`);
            }

            // D. Run
            command
                .complexFilter(complexFilter)
                .outputOptions([
                    '-map [vconc]',
                    '-map [aout]',
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-c:a aac',
                    '-pix_fmt yuv420p',
                    '-shortest'
                ])
                .save(outputPath)
                .on('start', (cmdLine) => console.log('FFmpeg Join Started...'))
                .on('error', (err) => {
                    console.error('FFmpeg Process Error:', err);
                    reject(err);
                })
                .on('end', async () => {
                    console.log('FFmpeg Join Finished');
                    try {
                        const videoBuffer = await fs.readFile(outputPath);
                        const videoBase64 = videoBuffer.toString('base64');
                        await fs.remove(tempDir);
                        resolve(videoBase64);
                    } catch (readErr) {
                        reject(readErr);
                    }
                });
        });

    } catch (error) {
        await fs.remove(tempDir).catch(() => {});
        throw error;
    }
}

module.exports = { processJoinVideo };
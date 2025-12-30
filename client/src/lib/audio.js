// Audio handling for ElevenLabs Conversational AI

// Constants
const SAMPLE_RATE = 16000; // ElevenLabs expects 16kHz
const CHUNK_SIZE = 4096; // Processing chunk size

export class AudioRecorder {
    constructor(onAudioData) {
        this.onAudioData = onAudioData; // Callback (base64 string) => void
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.isRecording = false;
    }

    async start() {
        if (this.isRecording) return;
        console.log('[AudioRecorder] Starting...');

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('[AudioRecorder] Media stream acquired:', this.mediaStream.id);

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE,
            });
            console.log('[AudioRecorder] AudioContext created. Current state:', this.audioContext.state);

            this.audioContext.onstatechange = () => {
                console.log('[AudioRecorder] AudioContext state changed to:', this.audioContext.state);
            };

            await this.audioContext.resume();
            console.log('[AudioRecorder] AudioContext resumed. State:', this.audioContext.state);

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Add a gain node just to ensure we have an active node chain
            const gain = this.audioContext.createGain();
            gain.gain.value = 1.0;

            this.processor = this.audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1);
            console.log('[AudioRecorder] ScriptProcessor created. Chunk size:', CHUNK_SIZE);

            this.chunkCount = 0;
            this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                this.chunkCount++;
                if (this.chunkCount % 50 === 0) {
                    console.log(`[AudioRecorder] onaudioprocess fired. Count: ${this.chunkCount}`);
                }
                this.processAudio(inputData);
            };

            source.connect(gain);
            gain.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.isRecording = true;
            console.log('[AudioRecorder] Started successfully');

            // Heartbeat to monitor health
            this.heartbeat = setInterval(() => {
                if (this.isRecording) {
                    console.log(`[AudioRecorder] Heartbeat - State: ${this.audioContext?.state}, Count: ${this.chunkCount}`);
                }
            }, 2000);

        } catch (error) {
            console.error('[AudioRecorder] Error starting:', error);
            throw error;
        }
    }

    stop() {
        if (!this.isRecording) return;
        console.log('[AudioRecorder] Stopping...');

        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.isRecording = false;
        console.log('[AudioRecorder] Stopped');
    }

    processAudio(float32Array) {
        // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        if (Math.random() < 1.0) { // Log 100% of chunks for debugging
            console.log(`[AudioRecorder] Capturing... chunk size: ${float32Array.length}`);
        }

        // Convert to Base64
        const base64 = this.arrayBufferToBase64(int16Array.buffer);
        this.onAudioData(base64);
    }

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}

export class AudioPlayer {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.queue = [];
        this.scheduledTime = 0;
    }

    init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE // Usually we should match the playback sample rate, usually 16k from ElevenLabs
            });
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    play(base64Data) {
        this.init();

        const audioData = this.base64ToArrayBuffer(base64Data);
        // Assuming incoming audio is PCM 16-bit 16kHz mono, NOT wav header.
        // We need to decode strictly as raw PCM or using decodeAudioData if it has headers.
        // ElevenLabs websocket 'audio' event usually sends raw PCM (without header) if configured as `pcm_16000`.

        const float32Data = this.convertInt16ToFloat32(audioData);

        const buffer = this.audioContext.createBuffer(1, float32Data.length, SAMPLE_RATE);
        buffer.getChannelData(0).set(float32Data);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

        // Schedule playback
        const currentTime = this.audioContext.currentTime;
        if (this.scheduledTime < currentTime) {
            this.scheduledTime = currentTime;
        }

        source.start(this.scheduledTime);
        this.scheduledTime += buffer.duration;
    }

    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    convertInt16ToFloat32(arrayBuffer) {
        const int16Array = new Int16Array(arrayBuffer);
        const float32Array = new Float32Array(int16Array.length);

        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }
        return float32Array;
    }

    reset() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.scheduledTime = 0;
        this.queue = [];
    }
}

class AudioCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.frameSize = 2048; // 128ms low-latency audio packetization at 16kHz
        this.frame = new Int16Array(this.frameSize);
        this.frameOffset = 0;
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (output && output[0]) {
            output[0].fill(0);
        }

        const channel = input && input[0];
        if (!channel) return true;

        for (let index = 0; index < channel.length; index++) {
            const sample = Math.max(-1, Math.min(1, channel[index]));
            this.frame[this.frameOffset++] = sample < 0
                ? sample * 0x8000
                : sample * 0x7fff;

            if (this.frameOffset === this.frameSize) {
                const completedFrame = this.frame;
                this.frame = new Int16Array(this.frameSize);
                this.frameOffset = 0;
                this.port.postMessage(completedFrame.buffer, [completedFrame.buffer]);
            }
        }

        return true;
    }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);

export interface AudioQueueOptions {
  fetchAudio: (text: string) => Promise<ArrayBuffer>;
}

export class AudioQueue {
  private queue: string[] = [];
  private processing = false;
  private currentAudio: HTMLAudioElement | null = null;
  private fetchAudio: (text: string) => Promise<ArrayBuffer>;

  constructor(options: AudioQueueOptions) {
    this.fetchAudio = options.fetchAudio;
  }

  enqueue(text: string): void {
    this.queue.push(text);
    if (!this.processing) {
      this.processNext();
    }
  }

  clear(): void {
    this.queue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  destroy(): void {
    this.clear();
  }

  get pending(): number {
    return this.queue.length;
  }

  get isPlaying(): boolean {
    return this.processing;
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const text = this.queue.shift()!;

    try {
      const audioData = await this.fetchAudio(text);
      const blob = new Blob([audioData], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        this.currentAudio = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          resolve();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          resolve();
        };

        audio.play().catch(() => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          resolve();
        });
      });
    } catch {
      // Fetch failed — skip this item and continue
    }

    this.processNext();
  }
}

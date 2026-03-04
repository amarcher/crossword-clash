// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TTSMuteButton, TTSSettingsModal } from "./TTSControls";
import { ELEVENLABS_VOICES } from "../../lib/elevenLabsClient";

afterEach(cleanup);

describe("TTSMuteButton", () => {
  it("shows Mute when not muted", () => {
    render(<TTSMuteButton muted={false} toggleMute={vi.fn()} openSettings={vi.fn()} />);
    expect(screen.getByText("Mute")).toBeTruthy();
  });

  it("shows Unmute when muted", () => {
    render(<TTSMuteButton muted={true} toggleMute={vi.fn()} openSettings={vi.fn()} />);
    expect(screen.getByText("Unmute")).toBeTruthy();
  });

  it("calls toggleMute on click", () => {
    const toggle = vi.fn();
    render(<TTSMuteButton muted={false} toggleMute={toggle} openSettings={vi.fn()} />);
    fireEvent.click(screen.getByText("Mute"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("calls openSettings on settings button click", () => {
    const open = vi.fn();
    render(<TTSMuteButton muted={false} toggleMute={vi.fn()} openSettings={open} />);
    fireEvent.click(screen.getByText("Settings"));
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("TTSSettingsModal", () => {
  const baseProps = () => ({
    settingsOpen: true,
    closeSettings: vi.fn(),
    voices: [] as SpeechSynthesisVoice[],
    voiceName: null as string | null,
    setVoiceName: vi.fn(),
    rate: 1.0,
    setRate: vi.fn(),
    pitch: 1.0,
    setPitch: vi.fn(),
    speak: vi.fn(),
    engine: "browser" as "browser" | "elevenlabs",
    setEngine: vi.fn(),
    elevenLabsAvailable: false,
    elevenLabsVoiceId: null as string | null,
    setElevenLabsVoiceId: vi.fn(),
    elevenLabsVoices: ELEVENLABS_VOICES,
  });

  it("renders nothing when closed", () => {
    const { container } = render(<TTSSettingsModal {...baseProps()} settingsOpen={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders modal when open", () => {
    render(<TTSSettingsModal {...baseProps()} />);
    expect(screen.getByText("Voice Settings")).toBeTruthy();
  });

  it("renders voice select with System Default", () => {
    render(<TTSSettingsModal {...baseProps()} />);
    expect(screen.getByText("System Default")).toBeTruthy();
  });

  it("renders rate and pitch sliders", () => {
    render(<TTSSettingsModal {...baseProps()} rate={1.3} pitch={0.7} />);
    expect(screen.getByText("Rate: 1.3")).toBeTruthy();
    expect(screen.getByText("Pitch: 0.7")).toBeTruthy();
  });

  it("calls speak on Test Voice click", () => {
    const props = baseProps();
    render(<TTSSettingsModal {...props} />);
    fireEvent.click(screen.getByText("Test Voice"));
    expect(props.speak).toHaveBeenCalledWith("Testing voice settings");
  });

  it("calls closeSettings on Done click", () => {
    const props = baseProps();
    render(<TTSSettingsModal {...props} />);
    fireEvent.click(screen.getByText("Done"));
    expect(props.closeSettings).toHaveBeenCalledTimes(1);
  });

  it("calls closeSettings on backdrop click", () => {
    const props = baseProps();
    render(<TTSSettingsModal {...props} />);
    const backdrop = document.querySelector(".bg-black\\/50");
    fireEvent.click(backdrop!);
    expect(props.closeSettings).toHaveBeenCalledTimes(1);
  });

  it("groups voices by language", () => {
    const voices = [
      { name: "Voice A", lang: "en-US" },
      { name: "Voice B", lang: "en-US" },
      { name: "Voice C", lang: "fr-FR" },
    ] as SpeechSynthesisVoice[];

    render(<TTSSettingsModal {...baseProps()} voices={voices} />);

    const select = screen.getByRole("combobox");
    const optgroups = select.querySelectorAll("optgroup");
    expect(optgroups.length).toBe(2);
    expect(optgroups[0].getAttribute("label")).toBe("en-US");
    expect(optgroups[1].getAttribute("label")).toBe("fr-FR");
  });

  it("does not show engine toggle when elevenLabsAvailable is false", () => {
    render(<TTSSettingsModal {...baseProps()} elevenLabsAvailable={false} />);
    expect(screen.queryByText("Engine")).toBeNull();
  });

  it("shows engine toggle when elevenLabsAvailable is true", () => {
    render(<TTSSettingsModal {...baseProps()} elevenLabsAvailable={true} />);
    expect(screen.getByText("Engine")).toBeTruthy();
  });

  it("shows browser voice controls in browser mode", () => {
    render(<TTSSettingsModal {...baseProps()} elevenLabsAvailable={true} engine="browser" />);
    expect(screen.getByText("Voice")).toBeTruthy();
    expect(screen.getByText("Rate: 1.0")).toBeTruthy();
    expect(screen.getByText("Pitch: 1.0")).toBeTruthy();
  });

  it("shows ElevenLabs voice dropdown in elevenlabs mode", () => {
    render(
      <TTSSettingsModal
        {...baseProps()}
        elevenLabsAvailable={true}
        engine="elevenlabs"
      />,
    );
    expect(screen.getByText("ElevenLabs Voice")).toBeTruthy();
    expect(screen.getByText("Rachel (default)")).toBeTruthy();
    // Rate/pitch sliders should not be shown
    expect(screen.queryByText("Rate: 1.0")).toBeNull();
    expect(screen.queryByText("Pitch: 1.0")).toBeNull();
  });

  it("calls setEngine when engine is changed", () => {
    const props = baseProps();
    props.elevenLabsAvailable = true;
    render(<TTSSettingsModal {...props} />);

    const engineSelect = screen.getByDisplayValue("Browser TTS");
    fireEvent.change(engineSelect, { target: { value: "elevenlabs" } });
    expect(props.setEngine).toHaveBeenCalledWith("elevenlabs");
  });

  it("calls setElevenLabsVoiceId when voice is changed", () => {
    const props = baseProps();
    props.elevenLabsAvailable = true;
    props.engine = "elevenlabs";
    render(<TTSSettingsModal {...props} />);

    const voiceSelect = screen.getByDisplayValue("Rachel (default)");
    fireEvent.change(voiceSelect, { target: { value: ELEVENLABS_VOICES[1].id } });
    expect(props.setElevenLabsVoiceId).toHaveBeenCalledWith(ELEVENLABS_VOICES[1].id);
  });
});

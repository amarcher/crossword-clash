// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TTSMuteButton, TTSSettingsModal } from "./TTSControls";

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
});

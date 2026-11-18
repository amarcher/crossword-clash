// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render as rtlRender, screen, fireEvent, cleanup, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { GameLobby } from "./GameLobby";
import { FriendsError } from "../../lib/friends";
import type { Player } from "../../types/game";

// The shared site bar's logo is a router Link, so the screen needs a router around it.
const render = (ui: ReactElement, options?: RenderOptions) => rtlRender(ui, { wrapper: MemoryRouter, ...options });

afterEach(cleanup);

vi.mock("react-qr-code", () => ({
  default: ({ value, size }: { value: string; size: number }) => (
    <div data-testid="qr-code" data-value={value} data-size={size} />
  ),
}));

const mockPlayers: Player[] = [
  { id: "1", gameId: "g1", userId: "u1", displayName: "Host Player", color: "#ff0000", score: 0 },
  { id: "2", gameId: "g1", userId: "u2", displayName: "Guest Player", color: "#00ff00", score: 0 },
];


describe("GameLobby prior solves", () => {
  it("marks a player who finished this puzzle before, Solved before on their own or Raced before in a room, and nobody else", () => {
    render(<GameLobby shareCode="ABC123" players={mockPlayers} isHost={true} onStartGame={vi.fn()} onCloseRoom={vi.fn()} solves={{ "u1": { mode: "solo" }, "u2": { mode: "versus" } }} />);
    expect(screen.getByText("Solved before")).toBeTruthy();
    expect(screen.getByText("Raced before")).toBeTruthy();
  });
});

describe("GameLobby", () => {
  describe("QR code", () => {
    it("renders QR code when shareCode is provided", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByTestId("qr-code")).toBeDefined();
    });

    it("does not render QR code when shareCode is null", () => {
      render(
        <GameLobby
          shareCode={null}
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.queryByTestId("qr-code")).toBeNull();
    });

    it("encodes join URL with origin and shareCode, pointing at the clean join route (not the lobby deep link)", () => {
      render(
        <GameLobby
          shareCode="XYZ789"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      const qr = screen.getByTestId("qr-code");
      expect(qr.dataset.value).toBe(`${window.location.origin}/?join=XYZ789`);
    });

    it("shows 'Scan to join' label", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByText("Scan to join")).toBeDefined();
    });
  });

  describe("how it works hint", () => {
    it("shows the numbered hint for the host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(
        screen.getByText("Friends scan the QR code or enter the code at crosswordclash.com."),
      ).toBeDefined();
      expect(screen.getByText("When everyone's in, press Start.")).toBeDefined();
    });

    it("does not show the hint for non-host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(
        screen.queryByText("Friends scan the QR code or enter the code at crosswordclash.com."),
      ).toBeNull();
    });
  });

  describe("Close Room", () => {
    it("shows Close Room button for host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByText("Close Room")).toBeDefined();
    });

    it("does not show Close Room button for non-host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.queryByText("Close Room")).toBeNull();
    });

    it("calls onCloseRoom when clicked", () => {
      const onCloseRoom = vi.fn();
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={onCloseRoom}
        />,
      );
      fireEvent.click(screen.getByText("Close Room"));
      expect(onCloseRoom).toHaveBeenCalledOnce();
    });
  });

  describe("host controls", () => {
    it("enables Start game when 2+ players", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      const btn = screen.getByText("Start game") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it("disables start button when fewer than 2 players", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={[mockPlayers[0]]}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      const btn = screen.getByText("Need 1 more player") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it("calls onStartGame when Start game is clicked", () => {
      const onStartGame = vi.fn();
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={onStartGame}
          onCloseRoom={() => {}}
        />,
      );
      fireEvent.click(screen.getByText("Start game"));
      expect(onStartGame).toHaveBeenCalledOnce();
    });
  });

  describe("non-host view", () => {
    it("shows waiting message for non-host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByText("Waiting for host to start the game...")).toBeDefined();
    });

    it("does not show Start game button for non-host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.queryByText("Start game")).toBeNull();
    });
  });

  describe("players list", () => {
    it("renders all players with names", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByText("Host Player")).toBeDefined();
      expect(screen.getByText("Guest Player")).toBeDefined();
    });

    it("shows player count", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByText("Players (2)")).toBeDefined();
    });

    it("marks first player as Host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByText("Host")).toBeDefined();
    });

    it("leads with Start or the waiting status, then the players, then the room code, QR code and settings", () => {
      for (const isHost of [true, false]) {
        cleanup();
        render(
          <GameLobby
            shareCode="ABC123"
            players={mockPlayers}
            isHost={isHost}
            onStartGame={() => {}}
            onCloseRoom={() => {}}
            onLeave={() => {}}
            wrongAnswerTimeout={0}
            onWrongAnswerTimeoutChange={() => {}}
          />,
        );
        const roster = screen.getByText("Players (2)");
        // The page is one column on a phone, so DOM order is visual order.
        const follows = (node: Element) => Boolean(roster.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(follows(screen.getByText("Room code")), `room code after the roster (host: ${isHost})`).toBe(true);
        expect(follows(screen.getByTestId("qr-code")), `QR after the roster (host: ${isHost})`).toBe(true);
        // The most important line leads: the host's Start, or a joiner's waiting status.
        if (isHost) {
          expect(follows(screen.getByText("Game settings")), "settings after the roster").toBe(true);
          expect(follows(screen.getByText("Start game")), "Start before the roster").toBe(false);
        } else {
          expect(follows(screen.getByRole("status")), "waiting status before the roster").toBe(false);
        }
      }
    });
  });

  describe("timeout selector", () => {
    it("shows timeout selector for host when props provided", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
          wrongAnswerTimeout={0}
          onWrongAnswerTimeoutChange={() => {}}
        />,
      );
      expect(screen.getByText("Wrong Answer Penalty")).toBeDefined();
    });

    it("does not show timeout selector when props are omitted", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.queryByText("Wrong Answer Penalty")).toBeNull();
    });

    it("does not show timeout selector for non-host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
          wrongAnswerTimeout={0}
          onWrongAnswerTimeoutChange={() => {}}
        />,
      );
      expect(screen.queryByText("Wrong Answer Penalty")).toBeNull();
    });

    it("calls onWrongAnswerTimeoutChange when option clicked", () => {
      const onChange = vi.fn();
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
          wrongAnswerTimeout={0}
          onWrongAnswerTimeoutChange={onChange}
        />,
      );
      fireEvent.click(screen.getByText("3s"));
      expect(onChange).toHaveBeenCalledWith(3);
    });
  });

  describe("leave button", () => {
    it("shows Leave button for non-host when onLeave is provided", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
          onLeave={() => {}}
        />,
      );
      expect(screen.getByText("Leave")).toBeDefined();
    });

    it("does not show Leave button when onLeave is undefined", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.queryByText("Leave")).toBeNull();
    });

    it("calls onLeave when Leave button is clicked", () => {
      const onLeave = vi.fn();
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
          onLeave={onLeave}
        />,
      );
      fireEvent.click(screen.getByText("Leave"));
      expect(onLeave).toHaveBeenCalledOnce();
    });
  });

  describe("an away host (phase f)", () => {
    const awayPlayers: Player[] = [{ ...mockPlayers[0], away: true }, mockPlayers[1]];

    it("dims the away row with an Away chip and keeps the Host chip, and the waiting line names the host", () => {
      render(<GameLobby shareCode="ABC123" players={awayPlayers} isHost={false} onStartGame={() => {}} onCloseRoom={() => {}} />);
      const row = screen.getByText("Host Player").closest("li")!;
      expect(row.dataset.away).toBe("true");
      expect(row.className).not.toMatch(/border-l|border-left/);
      expect(row.textContent).toContain("Away");
      expect(row.textContent).toContain("Host");
      expect(screen.getByText("Guest Player").closest("li")!.dataset.away).toBeUndefined();
      expect(screen.getByRole("status").textContent).toContain("Waiting for Host Player to come back");
    });

    it("shows Nudge host only to a joiner while the host is away; once sent it counts down the server's wait and comes back", async () => {
      vi.useFakeTimers();
      try {
        const onNudgeHost = vi.fn<(spell: number) => Promise<number>>(async () => 120);
        const { rerender } = render(
          <GameLobby shareCode="ABC123" players={mockPlayers} isHost={false} onStartGame={() => {}} onCloseRoom={() => {}} onNudgeHost={onNudgeHost} />,
        );
        expect(screen.queryByRole("button", { name: /Nudge/ })).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("Waiting for host to start the game");
        rerender(<GameLobby shareCode="ABC123" players={awayPlayers} isHost={false} onStartGame={() => {}} onCloseRoom={() => {}} onNudgeHost={onNudgeHost} />);
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Nudge host" }));
        });
        expect(onNudgeHost).toHaveBeenCalledOnce();
        expect(typeof onNudgeHost.mock.calls[0][0]).toBe("number");
        const counting = screen.getByRole("button", { name: /Nudge again in 2:00/ }) as HTMLButtonElement;
        expect(counting.disabled).toBe(true);
        await act(async () => {
          vi.advanceTimersByTime(18_000);
        });
        expect(screen.getByRole("button", { name: /Nudge again in 1:42/ })).toBeTruthy();
        await act(async () => {
          vi.advanceTimersByTime(102_000);
        });
        expect((screen.getByRole("button", { name: "Nudge host" }) as HTMLButtonElement).disabled).toBe(false);
        // The host, and a joiner with no nudge handler (friends off), never see the button.
        rerender(<GameLobby shareCode="ABC123" players={awayPlayers} isHost={true} onStartGame={() => {}} onCloseRoom={() => {}} onNudgeHost={onNudgeHost} />);
        expect(screen.queryByRole("button", { name: /Nudge/ })).toBeNull();
        rerender(<GameLobby shareCode="ABC123" players={awayPlayers} isHost={false} onStartGame={() => {}} onCloseRoom={() => {}} />);
        expect(screen.queryByRole("button", { name: /Nudge/ })).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a too-soon refusal counts down the seconds the server named, and a fresh away spell starts the ladder over", async () => {
      vi.useFakeTimers();
      try {
        const onNudgeHost = vi.fn<(spell: number) => Promise<number>>().mockRejectedValueOnce(new FriendsError("too_soon", "friends:too_soon:45")).mockResolvedValue(60);
        const { rerender } = render(
          <GameLobby shareCode="ABC123" players={awayPlayers} isHost={false} onStartGame={() => {}} onCloseRoom={() => {}} onNudgeHost={onNudgeHost} />,
        );
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Nudge host" }));
        });
        expect(screen.getByRole("button", { name: /Nudge again in 0:45/ })).toBeTruthy();
        const firstSpell = onNudgeHost.mock.calls[0][0];
        // The host comes back: the button goes, the line returns to plain waiting.
        rerender(<GameLobby shareCode="ABC123" players={mockPlayers} isHost={false} onStartGame={() => {}} onCloseRoom={() => {}} onNudgeHost={onNudgeHost} />);
        expect(screen.queryByRole("button", { name: /Nudge/ })).toBeNull();
        expect(screen.getByRole("status").textContent).toContain("Waiting for host to start the game");
        // ...and goes away again: a new spell, nudge available at once, with a later start.
        await act(async () => {
          vi.advanceTimersByTime(5_000);
        });
        rerender(<GameLobby shareCode="ABC123" players={awayPlayers} isHost={false} onStartGame={() => {}} onCloseRoom={() => {}} onNudgeHost={onNudgeHost} />);
        expect((screen.getByRole("button", { name: "Nudge host" }) as HTMLButtonElement).disabled).toBe(false);
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Nudge host" }));
        });
        expect(onNudgeHost.mock.calls[1][0]).toBeGreaterThan(firstSpell);
        expect(screen.getByRole("button", { name: /Nudge again in 1:00/ })).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("share code", () => {
    it("displays the share code", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.getByText("ABC123")).toBeDefined();
    });

    it("does not display share code section when null", () => {
      render(
        <GameLobby
          shareCode={null}
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.queryByText("Click to copy")).toBeNull();
      expect(screen.queryByText("Scan to join")).toBeNull();
    });
  });
});

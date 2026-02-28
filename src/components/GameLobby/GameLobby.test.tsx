// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GameLobby } from "./GameLobby";
import type { Player } from "../../types/game";

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

    it("encodes join URL with origin and shareCode", () => {
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
      expect(qr.dataset.value).toBe(
        `${window.location.origin}${window.location.pathname}?join=XYZ789`,
      );
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
    it("enables Start Game when 2+ players", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={true}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      const btn = screen.getByText("Start Game") as HTMLButtonElement;
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
      const btn = screen.getByText("Waiting for players...") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it("calls onStartGame when Start Game is clicked", () => {
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
      fireEvent.click(screen.getByText("Start Game"));
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

    it("does not show Start Game button for non-host", () => {
      render(
        <GameLobby
          shareCode="ABC123"
          players={mockPlayers}
          isHost={false}
          onStartGame={() => {}}
          onCloseRoom={() => {}}
        />,
      );
      expect(screen.queryByText("Start Game")).toBeNull();
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

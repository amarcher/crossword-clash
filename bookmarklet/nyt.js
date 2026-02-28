/**
 * NYT Crossword → Crossword Clash Bookmarklet
 *
 * Usage:
 * 1. Create a new bookmark in your browser
 * 2. Set the URL to: javascript:(function(){...minified version...})()
 * 3. Navigate to a NYT crossword page (requires NYT subscription)
 * 4. Click the bookmark — opens Crossword Clash with the puzzle loaded
 *
 * To create the bookmarklet URL, minify this file and wrap in javascript:(function(){...})()
 *
 * NOTE: The NYT API is undocumented and may change at any time.
 */
(function () {
  "use strict";

  // ---- CONFIG ----
  var APP_URL = "https://crossword-clash.vercel.app/";

  // ---- Inlined lz-string compressToEncodedURIComponent ----
  // From lz-string v1.4.5 (WTFPL license)
  var keyStrUriSafe =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

  function _compress(uncompressed, bitsPerChar, getCharFromInt) {
    if (uncompressed == null) return "";
    var i,
      value,
      context_dictionary = {},
      context_dictionaryToCreate = {},
      context_c = "",
      context_wc = "",
      context_w = "",
      context_enlargeIn = 2,
      context_dictSize = 3,
      context_numBits = 2,
      context_data = [],
      context_data_val = 0,
      context_data_position = 0,
      ii;

    for (ii = 0; ii < uncompressed.length; ii += 1) {
      context_c = uncompressed.charAt(ii);
      if (
        !Object.prototype.hasOwnProperty.call(context_dictionary, context_c)
      ) {
        context_dictionary[context_c] = context_dictSize++;
        context_dictionaryToCreate[context_c] = true;
      }

      context_wc = context_w + context_c;
      if (
        Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)
      ) {
        context_w = context_wc;
      } else {
        if (
          Object.prototype.hasOwnProperty.call(
            context_dictionaryToCreate,
            context_w,
          )
        ) {
          if (context_w.charCodeAt(0) < 256) {
            for (i = 0; i < context_numBits; i++) {
              context_data_val = context_data_val << 1;
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 8; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          } else {
            value = 1;
            for (i = 0; i < context_numBits; i++) {
              context_data_val = (context_data_val << 1) | value;
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = 0;
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 16; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn == 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          delete context_dictionaryToCreate[context_w];
        } else {
          value = context_dictionary[context_w];
          for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        context_dictionary[context_wc] = context_dictSize++;
        context_w = String(context_c);
      }
    }

    if (context_w !== "") {
      if (
        Object.prototype.hasOwnProperty.call(
          context_dictionaryToCreate,
          context_w,
        )
      ) {
        if (context_w.charCodeAt(0) < 256) {
          for (i = 0; i < context_numBits; i++) {
            context_data_val = context_data_val << 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 8; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        } else {
          value = 1;
          for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | value;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = 0;
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 16; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        delete context_dictionaryToCreate[context_w];
      } else {
        value = context_dictionary[context_w];
        for (i = 0; i < context_numBits; i++) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      }
      context_enlargeIn--;
      if (context_enlargeIn == 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
    }

    value = 2;
    for (i = 0; i < context_numBits; i++) {
      context_data_val = (context_data_val << 1) | (value & 1);
      if (context_data_position == bitsPerChar - 1) {
        context_data_position = 0;
        context_data.push(getCharFromInt(context_data_val));
        context_data_val = 0;
      } else {
        context_data_position++;
      }
      value = value >> 1;
    }

    while (true) {
      context_data_val = context_data_val << 1;
      if (context_data_position == bitsPerChar - 1) {
        context_data.push(getCharFromInt(context_data_val));
        break;
      } else context_data_position++;
    }
    return context_data.join("");
  }

  function compressToEncodedURIComponent(input) {
    if (input == null) return "";
    return _compress(input, 6, function (a) {
      return keyStrUriSafe.charAt(a);
    });
  }

  // ---- Extract puzzle type and date from URL ----
  function getPuzzleInfo() {
    var match = window.location.pathname.match(
      /\/crosswords\/game\/(\w+)\/(\d{4})\/(\d{2})\/(\d{2})/,
    );
    if (match) {
      return {
        type: match[1],
        date: match[2] + "-" + match[3] + "-" + match[4],
      };
    }
    // Check for undated puzzle type pages (e.g. /crosswords/game/mini)
    var typeMatch = window.location.pathname.match(
      /\/crosswords\/game\/(\w+)/,
    );
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return {
      type: typeMatch ? typeMatch[1] : "daily",
      date: yyyy + "-" + mm + "-" + dd,
    };
  }

  // ---- Fetch and transform puzzle ----
  async function run() {
    try {
      var info = getPuzzleInfo();
      var resp = await fetch(
        "/svc/crosswords/v6/puzzle/" + info.type + "/" + info.date + ".json",
        { credentials: "include" },
      );

      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          alert(
            "Crossword Clash: Could not fetch puzzle. Make sure you're logged in to NYT with an active crossword subscription.",
          );
        } else {
          alert("Crossword Clash: API error " + resp.status);
        }
        return;
      }

      var data = await resp.json();
      var body = data.body && data.body[0] ? data.body[0] : data;

      var cells = body.cells;
      if (!cells || !cells.length) {
        alert(
          "Crossword Clash: Could not parse puzzle data. The NYT API format may have changed.",
        );
        return;
      }

      var dims = body.dimensions;
      var rows = dims.height;
      var cols = dims.width;

      // Build flat grid arrays
      // Cells: {answer, clues, label?, type} — black cells are empty objects {}
      var grid = [];
      var gridnums = [];
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (!cell.answer) {
          // Black cell (empty object {})
          grid.push(".");
          gridnums.push(0);
        } else {
          grid.push(cell.answer.toUpperCase());
          gridnums.push(cell.label ? parseInt(cell.label, 10) || 0 : 0);
        }
      }

      // Build clues from body.clues (object keyed by index) + body.clueLists
      // clues: {"0": {cells:[...], direction:"Across", label:"1", text:[{plain:"..."}]}, ...}
      // clueLists: [{name:"Across", clues:[0,1,2,...]}, {name:"Down", clues:[30,31,...]}]
      var clueMap = body.clues;
      var clueLists = body.clueLists;
      var acrossClues = [];
      var downClues = [];
      var acrossAnswers = [];
      var downAnswers = [];

      for (var g = 0; g < clueLists.length; g++) {
        var group = clueLists[g];
        var isAcross = group.name.toLowerCase().indexOf("across") !== -1;
        var clueIndices = group.clues;

        for (var j = 0; j < clueIndices.length; j++) {
          var clue = clueMap[String(clueIndices[j])];
          if (!clue) continue;

          var num = clue.label;
          var text = "";
          if (clue.text && clue.text.length > 0) {
            text = clue.text[0].plain || clue.text[0] || "";
          }
          // Strip HTML tags from clue text
          text = text.replace(/<[^>]*>/g, "");
          var clueStr = num + ". " + text;

          // Build answer from cell references
          var answer = "";
          var cellRefs = clue.cells || [];
          for (var k = 0; k < cellRefs.length; k++) {
            var idx = cellRefs[k];
            if (idx >= 0 && idx < cells.length && cells[idx].answer) {
              answer += cells[idx].answer.toUpperCase();
            }
          }

          if (isAcross) {
            acrossClues.push(clueStr);
            acrossAnswers.push(answer);
          } else {
            downClues.push(clueStr);
            downAnswers.push(answer);
          }
        }
      }

      var typeLabel =
        info.type.charAt(0).toUpperCase() + info.type.slice(1);
      var title = data.title || "NYT " + typeLabel + " \u2014 " + info.date;
      var author =
        (data.constructors && data.constructors.join(", ")) ||
        data.editor ||
        "";

      var transfer = {
        title: title,
        author: author,
        size: { rows: rows, cols: cols },
        grid: grid,
        gridnums: gridnums,
        clues: { across: acrossClues, down: downClues },
        answers: { across: acrossAnswers, down: downAnswers },
      };

      var json = JSON.stringify(transfer);
      var compressed = compressToEncodedURIComponent(json);

      // Copy to clipboard as fallback (may fail if user gesture expired)
      try {
        navigator.clipboard.writeText(compressed);
      } catch (ignore) {}

      // Open app with clean URL (no puzzle data in URL to avoid Safe Browsing flags)
      var appOrigin = APP_URL.replace(/\/$/, "");
      var appWindow = window.open(APP_URL + "#import", "_blank");

      // Send puzzle data via postMessage when app signals ready
      var handler = function (event) {
        if (event.data && event.data.type === "crossword-clash-ready") {
          appWindow.postMessage(
            { type: "crossword-clash-puzzle", puzzle: compressed },
            appOrigin,
          );
          window.removeEventListener("message", handler);
        }
      };
      window.addEventListener("message", handler);

      // Clean up listener after 30s
      setTimeout(function () {
        window.removeEventListener("message", handler);
      }, 30000);
    } catch (e) {
      alert("Crossword Clash: " + (e.message || "Unknown error"));
    }
  }

  run();
})();

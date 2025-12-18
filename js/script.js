/*
Name: Kevin Tran
File: script.js
HW5 - Scrabble

Notes:
- Tile distribution/value data comes from tiles/Scrabble_Pieces_AssociativeArray_Jesse.js (Jesse M. Heines, UML)
- Board/tile images are from the provided homework graphics zip
*/

"use strict";


const BONUSES = {
  2: "DW",
  6: "DL",
  8: "DL",
  12: "DW"
};

let bag = [];                 // array of letters still in the bag
let placements = Array(15).fill(null); // placements[i] = { tileId, letter, value } or null
let tileCounter = 0;
let totalScore = 0;

$(function () {
  buildBoardGrid();
  buildRackGrid();
  wireButtons();
  installResponsiveSizing();
  restartGame();
});

/* --------------------------
   Responsive sizing
-------------------------- */

function installResponsiveSizing() {
  // Run once after initial layout and again on resize.
  updateTileSizing();
  $(window).on("resize", function () {
    updateTileSizing();
  });
}

function updateTileSizing() {
  const board = document.getElementById("board");
  const rackGrid = document.getElementById("rackGrid");
  if (!board || !rackGrid) return;

  const b = board.getBoundingClientRect();
  const r = rackGrid.getBoundingClientRect();

  // Board has 15 equal columns.
  const boardCellW = b.width / 15;
  const boardCellH = b.height;

  // Rack has 7 equal columns.
  const rackCellW = r.width / 7;
  const rackCellH = r.height;

  // Use a conservative factor so the tile sits *inside* the printed borders.
  const fitBoard = Math.floor(Math.min(boardCellW, boardCellH) * 0.86);
  const fitRack = Math.floor(Math.min(rackCellW, rackCellH) * 0.90);

  // Clamp to a reasonable range so tiles never become too tiny/huge.
  const size = Math.max(30, Math.min(fitBoard, fitRack, 72));
  document.documentElement.style.setProperty("--tile-size", `${size}px`);
}

function buildBoardGrid() {
  const $grid = $("#boardGrid");
  $grid.empty();

  for (let i = 0; i < 15; i++) {
    const bonus = BONUSES[i] || "";
    const $sq = $("<div>", {
      class: "square" + (bonus === "DW" ? " square--dw" : bonus === "DL" ? " square--dl" : ""),
      "data-index": i,
      "aria-label": `Board square ${i + 1}${bonus ? " (" + bonus + ")" : ""}`
    });
    $grid.append($sq);
  }

  $(".square").droppable({
    tolerance: "intersect",
    hoverClass: "drop-hover",
    accept: function ($drag) {
      const idx = Number($(this).data("index"));
      const tileId = $drag.attr("id");

      // Occupied by another tile -> reject
      const existing = placements[idx];
      if (existing && existing.tileId !== tileId) return false;

      // Contiguity rule: after first tile, no gaps; must be adjacent to existing.
      return isPlacementValid(idx, tileId);
    },
    drop: function (_event, ui) {
      const idx = Number($(this).data("index"));
      moveTileToBoardSquare(ui.draggable, idx);
      refreshUI();
    }
  });
}

function buildRackGrid() {
  const $grid = $("#rackGrid");
  $grid.empty();

  for (let i = 0; i < 7; i++) {
    const $slot = $("<div>", {
      class: "rack-slot",
      id: `rack-slot-${i}`,
      "data-slot": i,
      "aria-label": `Rack slot ${i + 1}`
    }).data("tileId", null);

    $grid.append($slot);
  }

  $(".rack-slot").droppable({
    tolerance: "intersect",
    hoverClass: "drop-hover",
    accept: function ($drag) {
      const incoming = $drag.attr("id");
      const current = $(this).data("tileId");
      return !current || current === incoming;
    },
    drop: function (_event, ui) {
      const slotIndex = Number($(this).data("slot"));
      moveTileToRackSlot(ui.draggable, slotIndex);
      refreshUI();
    }
  });
}

function wireButtons() {
  $("#btnSubmit").on("click", submitWord);
  $("#btnClear").on("click", clearBoardToRack);
  $("#btnRestart").on("click", restartGame);
}

// Tile bag and dealing

function restartGame() {
  // Reset ScrabbleTiles counts (provided data structure)
  for (const k in ScrabbleTiles) {
    if (!Object.prototype.hasOwnProperty.call(ScrabbleTiles, k)) continue;
    ScrabbleTiles[k]["number-remaining"] = ScrabbleTiles[k]["original-distribution"];
  }

  // Build the 100-tile bag from the distribution and shuffle
  bag = [];
  for (const letter in ScrabbleTiles) {
    if (!Object.prototype.hasOwnProperty.call(ScrabbleTiles, letter)) continue;
    const count = ScrabbleTiles[letter]["original-distribution"];
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  shuffle(bag);

  // Reset game state
  tileCounter = 0;
  totalScore = 0;
  placements = Array(15).fill(null);

  // Clear any existing tiles from DOM
  $(".tile").remove();
  $(".rack-slot").data("tileId", null);

  // Deal 7 tiles
  for (let i = 0; i < 7; i++) {
    dealOneToRack();
  }

  setMessage("New game started. Drag tiles to the board to form a word.");
  refreshUI();
}

function dealOneToRack() {
  const emptySlot = findFirstEmptyRackSlot();
  if (emptySlot == null) return false;

  const letter = drawLetterFromBag();
  if (!letter) return false;
  const value = ScrabbleTiles[letter]["value"];
  const $tile = createTile(letter, value);
  moveTileToRackSlot($tile, emptySlot);
  return true;
}

function drawLetterFromBag() {
  if (bag.length === 0) return null;
  const letter = bag.pop();
  // keep the provided data structure in-sync
  if (ScrabbleTiles[letter]) {
    ScrabbleTiles[letter]["number-remaining"] = Math.max(0, ScrabbleTiles[letter]["number-remaining"] - 1);
  }
  return letter;
}

function findFirstEmptyRackSlot() {
  const $slots = $(".rack-slot");
  for (let i = 0; i < $slots.length; i++) {
    const $s = $($slots[i]);
    if (!$s.data("tileId")) return i;
  }
  return null;
}

function createTile(letter, value) {
  const tileId = `tile-${tileCounter++}`;
  const src = tileImagePath(letter);

  const $img = $("<img>", {
    class: "tile",
    id: tileId,
    src,
    alt: `Tile ${letter}`,
    "data-letter": letter,
    "data-value": value
  });

  // Track where the tile currently is
  $img.data("square", null);
  $img.data("slot", null);

  // Make draggable
  $img.draggable({
    revert: "invalid",
    containment: "document",
    scroll: false,
    stack: ".tile",
    start: function () {
      $(this).addClass("dragging");
    },
    stop: function () {
      $(this).removeClass("dragging");
    }
  });

  return $img;
}

function tileImagePath(letter) {
  if (letter === "_") return "icons/Scrabble_Tile_Blank.jpg";
  return `icons/Scrabble_Tile_${letter}.jpg`;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

//  Movement

function isPlacementValid(newIdx, movingTileId) {
  // Build list of indices currently filled, excluding the moving tile (so moves are allowed)
  const filled = [];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    if (p && p.tileId !== movingTileId) filled.push(i);
  }

  // First tile can go anywhere
  if (filled.length === 0) return true;

  // If dropping onto a square already occupied by this same tile, allow
  if (filled.includes(newIdx)) return true;

  // Must be adjacent to existing tiles
  const adjacent = filled.some(i => Math.abs(i - newIdx) === 1);
  if (!adjacent) return false;

  // Combined set must be contiguous (no gaps)
  const all = [...filled, newIdx].sort((a, b) => a - b);
  for (let k = 1; k < all.length; k++) {
    if (all[k] - all[k - 1] !== 1) return false;
  }
  return true;
}

function moveTileToBoardSquare($tile, idx) {
  const tileId = $tile.attr("id");

  // If tile currently on a different board square, clear old placement
  const oldSquare = $tile.data("square");
  if (oldSquare != null && oldSquare !== idx) {
    placements[oldSquare] = null;
  }

  // If tile currently in a rack slot, free that slot
  const oldSlot = $tile.data("slot");
  if (oldSlot != null) {
    $(`#rack-slot-${oldSlot}`).data("tileId", null);
  }

  // Update placement
  placements[idx] = {
    tileId,
    letter: $tile.data("letter"),
    value: Number($tile.data("value"))
  };

  // Attach tile into the square
  const $square = $(`.square[data-index='${idx}']`);
  $tile.appendTo($square);
  $tile.css({ top: 0, left: 0, position: "relative" });

  $tile.data("square", idx);
  $tile.data("slot", null);
}

function moveTileToRackSlot($tile, slotIndex) {
  const tileId = $tile.attr("id");

  // If coming from board square, clear placement
  const oldSquare = $tile.data("square");
  if (oldSquare != null) {
    placements[oldSquare] = null;
  }

  // If coming from another slot, free that slot
  const oldSlot = $tile.data("slot");
  if (oldSlot != null && oldSlot !== slotIndex) {
    $(`#rack-slot-${oldSlot}`).data("tileId", null);
  }

  // Occupy this slot
  const $slot = $(`#rack-slot-${slotIndex}`);
  $slot.data("tileId", tileId);

  $tile.appendTo($slot);
  $tile.css({ top: 0, left: 0, position: "relative" });

  $tile.data("square", null);
  $tile.data("slot", slotIndex);
}

// Scoring and UI 

function currentWordIndices() {
  const idxs = [];
  for (let i = 0; i < placements.length; i++) {
    if (placements[i]) idxs.push(i);
  }
  return idxs;
}

function currentWordString() {
  const idxs = currentWordIndices();
  if (idxs.length === 0) return "—";
  const min = Math.min(...idxs);
  const max = Math.max(...idxs);
  let s = "";
  for (let i = min; i <= max; i++) {
    s += placements[i] ? placements[i].letter : " ";
  }
  return s.trim() || "—";
}

function computeCurrentScore() {
  const idxs = currentWordIndices();
  if (idxs.length === 0) return 0;

  const min = Math.min(...idxs);
  const max = Math.max(...idxs);

  // If there is a gap for some reason, score 0
  for (let i = min; i <= max; i++) {
    if (!placements[i]) return 0;
  }

  let wordMult = 1;
  let sum = 0;

  for (let i = min; i <= max; i++) {
    const p = placements[i];
    const bonus = BONUSES[i] || "";

    const letterMult = (bonus === "DL") ? 2 : 1;
    if (bonus === "DW") wordMult *= 2;

    sum += p.value * letterMult;
  }

  return sum * wordMult;
}

function refreshUI() {
  $("#currentWord").text(currentWordString());
  $("#currentScore").text(computeCurrentScore());
  $("#totalScore").text(totalScore);
  $("#tilesRemaining").text(bag.length);
}

// Buttons

function submitWord() {
  const idxs = currentWordIndices();
  if (idxs.length === 0) {
    setMessage("Place at least one tile on the board before submitting.");
    return;
  }

  const score = computeCurrentScore();
  totalScore += score;

  // Remove played tiles from DOM (they are 'used' for the next word)
  for (let i = 0; i < placements.length; i++) {
    if (placements[i]) {
      const tileId = placements[i].tileId;
      $(`#${tileId}`).remove();
      placements[i] = null;
    }
  }

  // Deal tiles until rack is full or bag is empty
  while (findFirstEmptyRackSlot() != null && bag.length > 0) {
    dealOneToRack();
  }

  setMessage(`Word submitted! +${score} points.`);
  refreshUI();
}

function clearBoardToRack() {
  // Move all placed tiles back to rack (to first available slots)
  const toMove = [];
  for (let i = 0; i < placements.length; i++) {
    if (placements[i]) {
      toMove.push(placements[i].tileId);
    }
  }

  if (toMove.length === 0) {
    setMessage("Board is already clear.");
    return;
  }

  for (const tileId of toMove) {
    const $tile = $(`#${tileId}`);
    const slot = findFirstEmptyRackSlot();
    if (slot == null) {
      // Should not happen because rack has 7 slots and these tiles came from it,
      // but handle gracefully anyway.
      setMessage("Rack is full; can't move tiles back.");
      break;
    }
    moveTileToRackSlot($tile, slot);
  }

  setMessage("Moved tiles back to the rack.");
  refreshUI();
}

function setMessage(msg) {
  $("#message").text(msg);
}

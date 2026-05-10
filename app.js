import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const draftBoard = document.getElementById("draftBoard");
const playersDiv = document.getElementById("players");

const players = [
  "Mbappe",
  "Haaland",
  "Rodri",
  "Bellingham",
  "Vinicius Jr",
  "Musiala"
];

function renderPlayers(draftedPlayers = []) {
  playersDiv.innerHTML = "";

  players.forEach(player => {
    if (draftedPlayers.includes(player)) return;

    const div = document.createElement("div");
    div.className = "player";

    div.innerHTML = `
      <span>${player}</span>
      <button data-player="${player}">Draften</button>
    `;

    playersDiv.appendChild(div);
  });

  document.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const player = btn.dataset.player;

      push(ref(database, "draftPicks"), {
        team: "Team Alpha",
        player: player
      });
    });
  });
}

onValue(ref(database, "draftPicks"), snapshot => {
  draftBoard.innerHTML = "";

  const data = snapshot.val() || {};
  const draftedPlayers = [];

  let pickNumber = 1;

  Object.values(data).forEach(pick => {
    draftedPlayers.push(pick.player);

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${pickNumber}</td>
      <td>${pick.team}</td>
      <td>${pick.player}</td>
    `;

    draftBoard.appendChild(row);
    pickNumber++;
  });

  renderPlayers(draftedPlayers);
});

let timer = 90;
const timerDiv = document.getElementById("timer");

setInterval(() => {
  timer--;
  if(timer <= 0){
    timer = 90;
  }
  timerDiv.innerText = timer;
},1000);

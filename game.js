// --- 1. 全局变量与常量 ---
let CARDS_DB = []; // 动态加载
const DIMENSIONS = ["chaos", "barren", "disqual", "calamity"];
const DIM_NAMES = { chaos: "混沌", barren: "荒芜", disqual: "失格", calamity: "厄孳" };
const LEVEL_LIMIT = {
    1: ["纯净级", "萌芽级", "灾祸级", "隐秘级"], 
    2: ["纯净级", "萌芽级", "灾祸级", "隐秘级"], 
    3: ["纯净级", "萌芽级", "灾祸级", "隐秘级"],
    4: ["纯净级", "萌芽级", "灾祸级", "崩坏级", "隐秘级"], 
    5: ["纯净级", "萌芽级", "灾祸级", "崩坏级", "隐秘级"], 
    6: ["纯净级", "萌芽级", "灾祸级", "崩坏级", "隐秘级"],
    7: ["纯净级", "萌芽级", "灾祸级", "崩坏级", "终末级", "隐秘级"], 
    8: ["纯净级", "萌芽级", "灾祸级", "崩坏级", "终末级", "隐秘级"], 
    9: ["纯净级", "萌芽级", "灾祸级", "崩坏级", "终末级", "隐秘级"]
};

// --- 2. 游戏状态 ---
let state = {
    round: 1,
    myScore: 0, oppScore: 0,
    myDeck: [], oppDeck: [], myDiscard: [], oppDiscard: [],
    myHand: [], oppHand: [],
    board: {}, 
    activeDims: [], 
    phase: "DRAW", 
    isMyTurn: true,
    myPassed: false, oppPassed: false
};

const delay = ms => new Promise(res => setTimeout(res, ms));
const rand = n => Math.floor(Math.random() * n);

// --- 3. 加载 JSON 并初始化 ---
async function loadDataAndStart() {
    try {
        const response = await fetch('./cards.json');
        if (!response.ok) throw new Error("网络请求失败");
        CARDS_DB = await response.json();
        initGame();
    } catch (error) {
        console.error(error);
        document.getElementById('log-content').innerHTML = `<div class="log-danger">读取 cards.json 失败！<br>请勿直接双击 HTML，请使用 VS Code 的 Live Server 插件或本地服务器运行。</div>`;
    }
}

function initGame() {
    let pool = [];
    CARDS_DB.forEach(c => { for(let i=0;i<3;i++) pool.push(JSON.parse(JSON.stringify(c))); });
    pool.sort(() => Math.random() - 0.5);
    state.myDeck = pool.slice(0, 15);
    state.oppDeck = pool.slice(15, 30);
    
    document.getElementById('my-deck-count').innerText = `牌库: ${state.myDeck.length}`;
    document.getElementById('opp-deck-count').innerText = `牌库: ${state.oppDeck.length}`;
    
    log("数据加载成功！游戏开始。先手由玩家担任。");
    startRound();
}

// --- 4. 回合流程 ---
async function startRound() {
    document.getElementById('round-info').innerText = `回合: ${state.round}`;
    state.board = {};
    state.myPassed = false; state.oppPassed = false;
    document.querySelectorAll('.slot').forEach(s => s.innerHTML = `<span class="label">${s.dataset.pos}</span>`);
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active-drop'));

    log(`--- 第 ${state.round} 回合 ---`);
    drawPhase();
    renderHands();

    let dims = [...DIMENSIONS].sort(() => Math.random() - 0.5).slice(0, 2);
    state.activeDims = dims;
    document.getElementById('dims-info').innerText = `维度: ${DIM_NAMES[dims[0]]} / ${DIM_NAMES[dims[1]]}`;
    log(`随机维度：${DIM_NAMES[dims[0]]}、${DIM_NAMES[dims[1]]}`);

    state.phase = "PLAY";
    document.getElementById('phase-info').innerText = `阶段: 出牌`;
    document.getElementById('btn-pass').disabled = false;
    
    state.isMyTurn = (state.round % 2 !== 0); 
    if (state.isMyTurn) {
        log("你获得了先手。请出牌 (1,3,5号位)。");
        enablePlayerPlay();
    } else {
        log("对手获得了先手。等待对手出牌...");
        await oppPlayTurn(true);
        startMyTurn();
    }
}

// --- 5. 玩家操作 ---
function enablePlayerPlay() {
    document.querySelectorAll('.slot').forEach(slot => {
        let pos = parseInt(slot.dataset.pos);
        let isMyPos = (state.isMyTurn && [1,3,5].includes(pos)) || (!state.isMyTurn && [2,4,6].includes(pos));
        if (isMyPos && !state.board[pos]) {
            slot.classList.add('active-drop');
            slot.onclick = () => playCardToSlot(pos);
        } else {
            slot.onclick = null;
        }
    });
}

function playCardToSlot(pos) {
    let selectedIndex = state.myHand.findIndex(c => c.selected);
    if (selectedIndex === -1) return;
    
    let card = state.myHand[selectedIndex];
    if (!LEVEL_LIMIT[Math.min(state.round, 9)].includes(card.level)) {
        log("该卡牌等级不符合当前回合规则！", "danger");
        return;
    }
    
    state.myHand.splice(selectedIndex, 1);
    state.board[pos] = { card: card, owner: 'player', faceUp: (pos === 1) }; 
    
    renderBoard();
    renderHands();
    checkTurnEnd();
}

document.getElementById('btn-pass').onclick = () => {
    state.myPassed = true;
    document.getElementById('btn-pass').disabled = true;
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active-drop'));
    log("你选择了停止出牌。");
    
    if (state.oppPassed) { startRevealPhase(); }
    else if (state.isMyTurn) { 
        state.isMyTurn = false;
        oppPlayTurn(false);
    } else {
        startRevealPhase();
    }
};

async function startMyTurn() {
    state.isMyTurn = true;
    document.getElementById('phase-info').innerText = `阶段: 出牌`;
    if (state.myPassed) return; 
    log("轮到你出牌 (2,4,6号位)。");
    enablePlayerPlay();
}

function checkTurnEnd() {
    if (state.isMyTurn) {
        if (state.myHand.length === 0 || [1,3,5].every(p => state.board[p])) {
            document.getElementById('btn-pass').click(); 
        }
    } else {
        if (state.oppHand.length === 0 || [2,4,6].every(p => state.board[p])) {
            state.oppPassed = true;
            startRevealPhase();
        }
    }
}

// --- 6. AI 操作 ---
async function oppPlayTurn(isFirst) {
    await delay(800);
    const allowedLevels = LEVEL_LIMIT[Math.min(state.round, 9)];
    let validCards = state.oppHand.filter(c => allowedLevels.includes(c.level));
    let availablePos = isFirst ? [2,4,6] : [1,3,5].filter(p => !state.board[p]); 

    for (let pos of availablePos) {
        if (validCards.length === 0) break;
        let idx = rand(validCards.length);
        let card = validCards.splice(idx, 1)[0];
        let realIdx = state.oppHand.findIndex(c => c.id === card.id);
        state.oppHand.splice(realIdx, 1);
        
        state.board[pos] = { card: card, owner: 'opp', faceUp: (pos === 1) };
        log(`对手在 ${pos} 号位放置了一张卡牌。`);
        renderBoard();
        renderHands();
        await delay(600);
    }
    
    state.oppPassed = true;
    log("对手停止了出牌。");
    if (state.myPassed) startRevealPhase();
    else if (!isFirst) startMyTurn();
    else startMyTurn();
}

// --- 7. 拼点与结算 ---
async function startRevealPhase() {
    state.phase = "REVEAL";
    document.getElementById('phase-info').innerText = `阶段: 拼点`;
    document.getElementById('btn-pass').disabled = true;
    log("--- 进入拼点阶段 ---");

    for (let i = 1; i <= 6; i++) {
        if (state.board[i] && !state.board[i].faceUp) {
            state.board[i].faceUp = true;
            renderBoard();
            log(`翻开 ${i} 号位卡牌：${state.board[i].card.name}`);
            let stats = state.board[i].card.stats;
            for(let k in stats) {
                if (stats[k] === '?') stats[k] = rand(6)+1;
                if (stats[k] === '-') stats[k] = 0;
            }
            await delay(600);
        }
    }
    await delay(500);
    settleRound();
}

function settleRound() {
    state.phase = "SETTLE";
    document.getElementById('phase-info').innerText = `阶段: 结算`;
    log("--- 开始结算 ---");

    let mainCard = state.board[1] ? state.board[1].card : null;
    let isFourDim = mainCard && mainCard.tags.includes("[主导]") && state.board[1].faceUp;
    
    let myScore = 0, oppScore = 0;
    let calcLog = "";

    if (isFourDim) {
        log("触发 [主导]！所有四维均计入计分！");
        for (let d of DIMENSIONS) {
            let mVal = mainCard.stats[d] || 0;
            let mySum = (state.board[3]?.card.stats[d]||0) + (state.board[5]?.card.stats[d]||0);
            let oppSum = (state.board[2]?.card.stats[d]||0) + (state.board[4]?.card.stats[d]||0) + (state.board[6]?.card.stats[d]||0);
            myScore += mVal * mySum;
            oppScore += mVal * oppSum;
            calcLog += `${DIM_NAMES[d]}(${mVal}×${mySum}) + `;
        }
    } else {
        if(!mainCard) log("没有主世界，分数均为0。");
        else {
            for (let d of state.activeDims) {
                let mVal = mainCard.stats[d] || 0;
                if(mVal === '-') mVal = 0;
                let mySum = (state.board[3]?.card.stats[d]||0) + (state.board[5]?.card.stats[d]||0);
                let oppSum = (state.board[2]?.card.stats[d]||0) + (state.board[4]?.card.stats[d]||0) + (state.board[6]?.card.stats[d]||0);
                myScore += mVal * mySum;
                oppScore += mVal * oppSum;
                calcLog += `${DIM_NAMES[d]}(${mVal}×${mySum}) + `;
            }
        }
    }

    myScore = Math.max(0, myScore);
    oppScore = Math.max(0, oppScore);

    log(`公式计算: ${calcLog.slice(0, -3)}`, "highlight");
    log(`你的得分：${myScore} | 对手得分：${oppScore}`, "highlight");

    if (myScore > oppScore) {
        state.myScore++;
        log("你赢得了本回合！", "success");
    } else if (oppScore > myScore) {
        state.oppScore++;
        log("对手赢得了本回合！", "danger");
    } else {
        state.myScore++;
        state.oppScore++;
        log("平局！双方各得1分。");
    }

    document.getElementById('my-win-points').innerText = `胜点: ${state.myScore}`;
    document.getElementById('opp-win-points').innerText = `胜点: ${state.oppScore}`;

    setTimeout(discardPhase, 1500);
}

// --- 8. 弃牌与下一回合 ---
function discardPhase() {
    state.myDiscard.push(...state.myHand.splice(1));
    state.oppDiscard.push(...state.oppHand.splice(1));
    document.getElementById('my-discard-count').innerText = `弃牌: ${state.myDiscard.length}`;
    renderHands();
    
    if (state.myScore >= 5 || state.oppScore >= 5) {
        if (state.myScore === state.oppScore) {
            log("双方均达到5分，进入决胜回合！");
        } else if (state.myScore >= 5) {
            log("🎉 你获得了最终胜利！", "success");
            document.getElementById('phase-info').innerText = "游戏结束";
            return;
        } else {
            log("💀 对手获得了最终胜利！", "danger");
            document.getElementById('phase-info').innerText = "游戏结束";
            return;
        }
    }
    state.round++;
    startRound();
}

// --- 9. 渲染 UI ---
function renderBoard() {
    document.querySelectorAll('.slot').forEach(slot => {
        let pos = parseInt(slot.dataset.pos);
        let data = state.board[pos];
        if (data) {
            slot.innerHTML = createCardHTML(data.card, data.faceUp, true);
        }
    });
}

function renderHands() {
    const myHandDiv = document.getElementById('my-hand');
    myHandDiv.innerHTML = '';
    state.myHand.forEach((card) => {
        let el = document.createElement('div');
        el.innerHTML = createCardHTML(card, true, false);
        let cardEl = el.firstChild;
        cardEl.onclick = () => {
            if (state.phase !== "PLAY" || !state.isMyTurn) return;
            state.myHand.forEach(c => c.selected = false);
            card.selected = true;
            renderHands();
        };
        if (card.selected) cardEl.style.border = "2px solid var(--gold)";
        myHandDiv.appendChild(cardEl);
    });

    const oppHandDiv = document.getElementById('opp-hand');
    oppHandDiv.innerHTML = '';
    state.oppHand.forEach(() => {
        let el = document.createElement('div');
        el.innerHTML = createCardHTML({name: "未知"}, false, false);
        oppHandDiv.appendChild(el.firstChild);
    });

    document.getElementById('my-deck-count').innerText = `牌库: ${state.myDeck.length}`;
    document.getElementById('opp-deck-count').innerText = `牌库: ${state.oppDeck.length}`;
}

function createCardHTML(card, faceUp, inSlot) {
    if (!faceUp) return `<div class="card face-down ${inSlot?'in-slot':''}"></div>`;
    
    let stats = card.stats || {};
    return `
    <div class="card ${inSlot?'in-slot':''}">
        <div class="card-header">${card.name}</div>
        <div class="card-stats">
            <div>混<span>${stats.chaos}</span></div>
            <div>荒<span>${stats.barren}</span></div>
            <div>失<span>${stats.disqual}</span></div>
            <div>厄<span>${stats.calamity}</span></div>
        </div>
        <div class="card-text">${card.text || ''}</div>
        <div class="card-footer">${card.level}</div>
    </div>`;
}

function drawPhase() {
    while (state.myHand.length < 5 && state.myDeck.length > 0) state.myHand.push(state.myDeck.pop());
    while (state.oppHand.length < 5 && state.oppDeck.length > 0) state.oppHand.push(state.oppDeck.pop());
}

function log(msg, type = "") {
    let el = document.createElement('div');
    el.className = type ? `log-${type}` : "";
    el.innerText = msg;
    document.getElementById('log-content').appendChild(el);
    document.getElementById('log-content').scrollTop = document.getElementById('log-content').scrollHeight;
}

// 启动入口修改
window.onload = loadDataAndStart;

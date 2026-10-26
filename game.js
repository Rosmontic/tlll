let CARDS_DB = [];
const DIMENSIONS = ["chaos", "barren", "disqual", "calamity"];
const DIM_NAMES = { chaos: "混沌", barren: "荒芜", disqual: "失格", calamity: "厄孳" };
const LEVEL_LIMIT = { 1:["纯净级","萌芽级","灾祸级","隐秘级"], 2:["纯净级","萌芽级","灾祸级","隐秘级"], 3:["纯净级","萌芽级","灾祸级","隐秘级"], 4:["纯净级","萌芽级","灾祸级","崩坏级","隐秘级"], 5:["纯净级","萌芽级","灾祸级","崩坏级","隐秘级"], 6:["纯净级","萌芽级","灾祸级","崩坏级","隐秘级"], 7:["纯净级","萌芽级","灾祸级","崩坏级","终末级","隐秘级"], 8:["纯净级","萌芽级","灾祸级","崩坏级","终末级","隐秘级"], 9:["纯净级","萌芽级","灾祸级","崩坏级","终末级","隐秘级"] };

let state = { round: 1, myScore: 0, oppScore: 0, myDeck: [], oppDeck: [], myDiscard: [], oppDiscard: [], myHand: [], oppHand: [], board: {}, activeDims: [], phase: "DRAW", isMyTurn: true, myPassed: false, oppPassed: false };
const delay = ms => new Promise(res => setTimeout(res, ms));

// === 【核心引擎】动态执行 JSON 代码 ===
function runEffect(cardContext, triggerName) {
    if (!cardContext || !cardContext.effects || !cardContext.effects[triggerName]) return;
    const code = cardContext.effects[triggerName];
    
    // 提供给 JSON 代码执行的强大 API 库
    const api = {
        log: (msg) => log(`[效果] ${msg}`, "success"),
        modStat: (card, stat, val) => { if(card && card.stats[stat] !== undefined && typeof card.stats[stat] === 'number') card.stats[stat] += val; },
        getPrevCard: (pos) => { for(let i = pos-1; i >= 1; i--) { if(state.board[i]) return state.board[i].card; } return null; },
        getAllFaceUpCards: () => Object.values(state.board).filter(b => b.faceUp).map(b => b.card),
        getOtherInnerWorldFaceUpCards: (myPos) => {
            return Object.entries(state.board)
                .filter(([pos, b]) => b.faceUp && parseInt(pos) >= 2 && parseInt(pos) <= 6 && parseInt(pos) !== myPos)
                .map(([pos, b]) => b.card);
        },
        draw: (owner, num) => {
            let deck = owner === 'player' ? state.myDeck : state.oppDeck;
            let hand = owner === 'player' ? state.myHand : state.oppHand;
            let drawnCards = [];
            for(let i=0; i<num; i++) { 
                if(deck.length > 0) {
                    let card = deck.pop();
                    hand.push(card);
                    drawnCards.push(card);
                    // 触发 [抽取] 效果
                    runEffect(card, "onDraw");
                }
            }
            return drawnCards;
        },
        discardRandom: (owner, num) => {
            let hand = owner === 'player' ? state.myHand : state.oppHand;
            let discard = owner === 'player' ? state.myDiscard : state.oppDiscard;
            for(let i=0; i<num; i++) {
                if(hand.length === 0) break;
                let idx = Math.floor(Math.random() * hand.length);
                discard.push(hand.splice(idx, 1)[0]);
            }
        },
        addCardToDeck: (owner, cardId) => {
            let cardData = CARDS_DB.find(c => c.id === cardId);
            if(cardData) {
                let deck = owner === 'player' ? state.myDeck : state.oppDeck;
                deck.push(JSON.parse(JSON.stringify(cardData)));
            }
        },
        addCardToHand: (owner, cardId) => {
            let cardData = CARDS_DB.find(c => c.id === cardId);
            if(cardData) {
                let hand = owner === 'player' ? state.myHand : state.oppHand;
                hand.push(JSON.parse(JSON.stringify(cardData)));
            }
        },
        addCardToOpponentHand: (owner, cardId) => {
            // owner是自己，所以对手是相反的
            let oppOwner = owner === 'player' ? 'opp' : 'player';
            api.addCardToHand(oppOwner, cardId);
        }
    };

    try {
        const func = new Function('thisCard', 'api', code);
        func(cardContext, api);
        renderBoard(); renderHands();
    } catch (e) {
        log(`效果执行报错: ${e.message}`, "danger");
        console.error(e);
    }
}

async function loadDataAndStart() {
    try {
        const response = await fetch('./cards.json');
        CARDS_DB = await response.json();
        initGame();
    } catch (error) {
        document.getElementById('log-content').innerHTML = `<div class="log-danger">读取失败！请确保你使用了 Live Server 且 cards.json 存在。</div>`;
    }
}

function initGame() {
    let pool = [];
    CARDS_DB.forEach(c => { for(let i=0;i<3;i++) pool.push(JSON.parse(JSON.stringify(c))); });
    pool.sort(() => Math.random() - 0.5);
    state.myDeck = pool.slice(0, 15); state.oppDeck = pool.slice(15, 30);
    log("游戏开始！");
    startRound();
}

async function startRound() {
    document.getElementById('round-info').innerText = `回合: ${state.round}`;
    state.board = {}; state.myPassed = false; state.oppPassed = false;
    document.querySelectorAll('.slot').forEach(s => s.innerHTML = `<span class="label">${s.dataset.pos}</span>`);
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active-drop'));
    
    drawPhase(); renderHands();

    let dims = [...DIMENSIONS].sort(() => Math.random() - 0.5).slice(0, 2);
    state.activeDims = dims;
    document.getElementById('dims-info').innerText = `维度: ${DIM_NAMES[dims[0]]} / ${DIM_NAMES[dims[1]]}`;
    log(`--- 第 ${state.round} 回合，维度：${DIM_NAMES[dims[0]]} / ${DIM_NAMES[dims[1]]} ---`);

    state.phase = "PLAY";
    document.getElementById('phase-info').innerText = `阶段: 出牌`;
    document.getElementById('btn-pass').disabled = false;
    
    state.isMyTurn = (state.round % 2 !== 0); 
    if (state.isMyTurn) {
        log("你是先手 (1,3,5号位)。");
        enablePlayerPlay();
    } else {
        log("对手是先手。");
        await oppPlayTurn(true); 
        startMyTurn(); 
    }
}

function enablePlayerPlay() {
    document.querySelectorAll('.slot').forEach(slot => {
        let pos = parseInt(slot.dataset.pos);
        let isMyPos = (state.isMyTurn && [1,3,5].includes(pos)) || (!state.isMyTurn && [2,4,6].includes(pos));
        if (isMyPos && !state.board[pos]) {
            slot.classList.add('active-drop');
            slot.onclick = () => {
                let idx = state.myHand.findIndex(c => c.selected);
                if (idx === -1) { log("请先点击手牌选中！", "danger"); return; }
                let card = state.myHand.splice(idx, 1)[0];
                state.board[pos] = { card: card, owner: 'player', faceUp: (pos === 1) };
                renderBoard(); renderHands(); checkTurnEnd();
            };
        } else slot.onclick = null;
    });
}

document.getElementById('btn-pass').onclick = () => {
    state.myPassed = true;
    document.getElementById('btn-pass').disabled = true;
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active-drop'));
    log("你选择了停止出牌。");
    if (state.oppPassed) startRevealPhase();
    else if (state.isMyTurn) { state.isMyTurn = false; oppPlayTurn(false); }
    else startRevealPhase();
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
        if (state.myHand.length === 0 || [1,3,5].every(p => state.board[p])) document.getElementById('btn-pass').click(); 
    } else {
        if (state.oppHand.length === 0 || [2,4,6].every(p => state.board[p])) { state.oppPassed = true; startRevealPhase(); }
    }
}

async function oppPlayTurn(isFirst) {
    await delay(800);
    let validCards = state.oppHand.filter(c => LEVEL_LIMIT[Math.min(state.round, 9)].includes(c.level));
    let availablePos = isFirst ? [2,4,6] : [1,3,5].filter(p => !state.board[p]); 

    for (let pos of availablePos) {
        if (validCards.length === 0) break;
        let idx = Math.floor(Math.random() * validCards.length);
        let card = validCards.splice(idx, 1)[0];
        let realIdx = state.oppHand.findIndex(c => c.id === card.id);
        state.oppHand.splice(realIdx, 1);
        state.board[pos] = { card: card, owner: 'opp', faceUp: (pos === 1) };
        log(`对手在 ${pos} 号位放置了一张卡牌。`);
        renderBoard(); renderHands();
        await delay(600);
    }
    state.oppPassed = true;
    if (state.myPassed) startRevealPhase();
    else if (!isFirst) startMyTurn();
    else startMyTurn();
}

async function startRevealPhase() {
    state.phase = "REVEAL";
    document.getElementById('phase-info').innerText = `阶段: 拼点`;
    document.getElementById('btn-pass').disabled = true;
    log("--- 进入拼点阶段 ---");

    for (let i = 1; i <= 6; i++) {
        if (state.board[i] && !state.board[i].faceUp) {
            state.board[i].faceUp = true;
            renderBoard();
            log(`翻开 ${i} 号位：${state.board[i].card.name}`);
            // 核心：翻牌触发 JSON 里的 [显现] 逻辑
            runEffect(state.board[i].card, "onReveal");
            await delay(800);
        }
    }
    await delay(500);
    settleRound();
}

function settleRound() {
    state.phase = "SETTLE";
    document.getElementById('phase-info').innerText = `阶段: 结算`;
    let mainCard = state.board[1] ? state.board[1].card : null;
    let isFourDim = mainCard && mainCard.tags.includes("[主导]") && state.board[1].faceUp;
    
    let myScore = 0, oppScore = 0, calcLog = "";
    let calcDims = isFourDim ? DIMENSIONS : state.activeDims;

    for (let d of calcDims) {
        let mVal = (mainCard && mainCard.stats[d] !== '-') ? mainCard.stats[d] : 0;
        let mySum = (state.board[3]?.card.stats[d]||0) + (state.board[5]?.card.stats[d]||0);
        let oppSum = (state.board[2]?.card.stats[d]||0) + (state.board[4]?.card.stats[d]||0) + (state.board[6]?.card.stats[d]||0);
        myScore += mVal * mySum; oppScore += mVal * oppSum;
        calcLog += `${DIM_NAMES[d]}(${mVal}×${mySum}) + `;
    }
    myScore = Math.max(0, myScore); oppScore = Math.max(0, oppScore);
    log(`计算: ${calcLog.slice(0, -3)}`, "highlight");
    log(`你: ${myScore} | 对手: ${oppScore}`, "highlight");

    if (myScore > oppScore) { state.myScore++; log("你赢了本回合！", "success"); }
    else if (oppScore > myScore) { state.oppScore++; log("对手赢了本回合！", "danger"); }
    else { state.myScore++; state.oppScore++; log("平局！"); }

    document.getElementById('my-win-points').innerText = `胜点: ${state.myScore}`;
    document.getElementById('opp-win-points').innerText = `胜点: ${state.oppScore}`;
    
    if(state.myScore >= 5 || state.oppScore >= 5) log("游戏结束！");
    else setTimeout(discardPhase, 1500);
}

function discardPhase() {
    // 简化处理弃牌和保留 (暂未实现玩家主动选择)
    state.myDiscard.push(...state.myHand.splice(1));
    state.oppDiscard.push(...state.oppHand.splice(1));
    state.round++; startRound();
}

// --- 渲染 UI ---
function renderBoard() {
    document.querySelectorAll('.slot').forEach(slot => {
        let pos = parseInt(slot.dataset.pos);
        let data = state.board[pos];
        if (data) slot.innerHTML = createCardHTML(data.card, data.faceUp, true);
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
    document.getElementById('my-discard-count').innerText = `弃牌: ${state.myDiscard.length}`;
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
    while (state.myHand.length < 5 && state.myDeck.length > 0) {
        let c = state.myDeck.pop(); state.myHand.push(c); runEffect(c, "onDraw");
    }
    while (state.oppHand.length < 5 && state.oppDeck.length > 0) {
        let c = state.oppDeck.pop(); state.oppHand.push(c); runEffect(c, "onDraw");
    }
}

function log(msg, type = "") {
    let el = document.createElement('div');
    el.className = type ? `log-${type}` : "";
    el.innerText = msg;
    document.getElementById('log-content').appendChild(el);
    document.getElementById('log-content').scrollTop = document.getElementById('log-content').scrollHeight;
}

window.onload = loadDataAndStart;

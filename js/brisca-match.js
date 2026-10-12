/* =============================================
   EL PEDRO — brisca-match.js
   Una partida de Brisca en la mesa: reparte, saca
   la muestra, da el turno, mueve a los rivales de la
   máquina y cuenta cada baza con voz, sonido y
   animaciones. Tus cartas se eligen tocándolas o con
   su número; si está activado, el primer toque la
   levanta y la dice, y el segundo la juega.
   ============================================= */
'use strict';

/** Lo que dura cada momento sin voz (modo visual), en milisegundos. */
const BRISCA_BEAT = { play: 650, trick: 900, swapTrump: 1100, cante: 1400, deckOut: 900 };

class BriscaMatch extends Match {
    static get kind() { return 'brisca'; }
    get roundWord() { return 'mano'; }
    get beats() { return BRISCA_BEAT; }

    setup() {
        this.sel = null;            // tu carta elegida (levantada), a la espera del segundo toque
        this.lastTrick = null;      // la última baza, por si la quieres repasar
        this.lastResult = null;
        this.advisor = new BriscaBot(this.game, this.me, { level: 'dificil' }, makeRng(this.seed + 4242));
        this.syncShown();
    }

    makeGame(rules, seed) { return new BriscaGame({ players: this.seats.map(s => ({ name: s.name })), rules, seed }); }
    makeMirror(rules) { return new BriscaMirror({ names: this.seats.map(s => s.name), rules, me: this.me }); }
    makeBot(p, char, rng) { return new BriscaBot(this.game, p, char, rng); }
    eventFor(e, seat) { return briscaEventFor(e, seat); }
    observe(e) { this.advisor.observe(e); }
    stateKey() { const g = this.game; return `${g.phase}|${g.round}|${g.tricks}|${g.trick.length}|${g.sung.length}|${g.trump ? g.trump.suit + g.trump.rank : ''}`; }

    /** Lo que se ve en la mesa, al ritmo de lo que se cuenta (la partida ya va por delante). */
    syncShown() {
        const g = this.game;
        this.shown = {
            trick: g.trick.map(t => ({ ...t })),
            hand: (g.handOf?.(this.me) || []).map(c => c && !c.hidden ? c : null),
            counts: g.players.map((_, p) => g.countOf ? g.countOf(p) : 0),
            deck: g.deck.length,
            trump: g.trump,
            won: g.players.map(pl => (pl.won?.length) || 0),
            points: g.players.map((_, p) => g.pointsOf(p)),
        };
    }

    get trumpSuit() { return this.game.trumpSuit; }
    pts(p) { return this.shown.points[p] || 0; }
    showPoints() { return !!this.game.rules.showPoints; }

    introText() {
        const g = this.game;
        let text = super.introText();
        if (g.teamPlay) {
            const mates = g.partners(this.me).map(p => this.names[p]);
            text += ` Jugáis por parejas: vas con ${Txt.list(mates)}.`;
        }
        const goal = g.rules.winsToWin;
        if (goal > 1) text += ` Gana quien consiga antes ${goal} manos.`;
        if (this.practice) text = 'Partida de práctica: con la A te doy un consejo. ' + text;
        return text;
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'play', label: 'Jugar la carta', key: 'Enter', cls: 'main' },
            { kind: 'swapTrump', label: 'Cambiar la muestra', key: 'X', cls: 'main' },
            { kind: 'cante', label: 'Cantar', key: 'V', cls: 'call' },
            { kind: 'advice', label: 'Consejo', key: 'A' },
            { kind: 'table', label: 'La mesa', key: 'M', cls: 'small talk' },
            { kind: 'info', label: 'Cómo va', key: 'I', cls: 'small talk' },
            { kind: 'cards', label: 'Mis cartas', key: 'C', cls: 'small talk' },
            { kind: 'repeat', label: 'Repetir', key: 'Espacio', cls: 'small talk' },
            { kind: 'menu', label: 'Pausa', key: 'Esc', cls: 'small' },
        ];
    }

    button(kind) {
        if (kind === 'table') return this.describeTrick();
        if (kind === 'advice' && !this.want?.kinds.has('advice')) return this.advise();
        return super.button(kind);
    }

    buildCenter(center) {
        center.innerHTML = `
            <button id="b-deck" class="pile pile-btn nav stock" aria-label="Mazo">
                <span class="stock-cards">
                    <span class="pile-card muestra" id="b-trump"></span>
                    <span class="pile-card deck-top" id="b-deck-card">${CardArt.back()}</span>
                </span>
                <span class="pile-cap">Mazo: <span id="b-deck-count">0</span></span>
                <span id="b-trump-chip" class="trump-chip" aria-hidden="true"></span>
            </button>
            <div id="trick" class="trick" role="list" aria-label="Cartas de esta baza"></div>`;
        $('b-deck').addEventListener('click', () => this.describeTrump());
    }

    render() {
        const g = this.game, me = this.me, S = this.shown;
        const myTurn = g.phase === 'turn' && g.current === me && !!this.want;
        const playable = myTurn ? new Set(g.playable(me)) : null;
        const res = this.lastResult;
        for (let p = 0; p < g.n; p++) {
            const seat = Board.seatEl(p);
            if (!seat) continue;
            seat.classList.toggle('active', g.phase === 'turn' && g.current === p);
            seat.classList.toggle('winner', !!res && res.winners.includes(p));
            if (g.teamPlay) { seat.classList.toggle('team-a', g.team(p) === g.team(me)); seat.classList.toggle('team-b', g.team(p) !== g.team(me)); }
            Board.setWins(p, g.players[p].wins);
            Board.setScore(p, res ? Txt.points(res.points[p]) : '');
            const extra = Board.extraEl(p);
            if (extra) {
                const won = S.won[p];
                const ptsText = this.showPoints() || res ? ` · ${Txt.points(res ? res.points[p] : this.pts(p))}` : '';
                const label = won ? `${won / g.n === 1 ? '1 baza' : Math.round(won / g.n) + ' bazas'}${ptsText}` : 'Sin bazas';
                const k = label + won;
                if (extra.dataset.k !== k) {
                    extra.dataset.k = k;
                    extra.innerHTML = `<span class="won-pile${won ? '' : ' none'}" aria-hidden="true">${won ? CardArt.back() : ''}</span><span class="won-txt"></span>`;
                    extra.querySelector('.won-txt').textContent = label;
                }
            }
            const hand = Board.handEl(p);
            if (p === me) {
                const slots = S.hand;
                Board.trimSlots(p, slots.length);
                slots.forEach((c, s) => {
                    const b = Board.slotButton(p, s, hand, s);
                    Board.setFace(b, c);
                    b.classList.toggle('empty', !c);
                    b.classList.toggle('trumpcard', !!c && c.suit === this.trumpSuit);
                    b.classList.toggle('chosen', this.sel === s && !!c);
                    b.classList.toggle('pickable', !!c && !!playable?.has(s));
                    b.classList.toggle('blocked', !!c && !!playable && !playable.has(s));
                    b.disabled = !c;
                    b.setAttribute('aria-label', this.cardLabel(s, playable));
                });
            } else {
                const n = S.counts[p];
                if (hand.dataset.n !== String(n)) {
                    hand.dataset.n = n;
                    hand.innerHTML = Array.from({ length: n }, () => `<span class="mini">${CardArt.back()}</span>`).join('');
                    hand.setAttribute('aria-label', `${cap(this.names[p])}: ${n === 1 ? '1 carta' : n + ' cartas'}`);
                }
            }
        }
        // Centro: el mazo con la muestra debajo, y la baza.
        const idle = g.phase === 'idle';
        $('b-deck-count').textContent = idle ? 'barajando' : S.deck;
        const tr = $('b-trump');
        const tk = S.trump ? S.trump.suit + S.trump.rank : '';
        if (tr.dataset.k !== tk) { tr.dataset.k = tk; tr.innerHTML = S.trump ? CardArt.face(S.trump) : ''; }
        $('b-deck-card').hidden = !idle && S.deck <= 1;
        $('b-deck').classList.toggle('empty', !idle && !S.deck);
        $('b-deck').setAttribute('aria-label', S.deck ? `Mazo: ${S.deck} cartas. Triunfo: ${this.trumpSuit}${S.trump ? `; la muestra es ${Txt.cardShort(S.trump)}` : ''}` : `Mazo acabado. Triunfo: ${this.trumpSuit || 'ninguno'}`);
        const chip = $('b-trump-chip');
        chip.textContent = this.trumpSuit ? `Triunfo: ${this.trumpSuit}` : '';
        chip.dataset.suit = this.trumpSuit || '';
        const trick = $('trick');
        const key = S.trick.map(t => t.p + t.card.suit + t.card.rank).join('|');
        if (trick.dataset.k !== key) {
            trick.dataset.k = key;
            trick.innerHTML = '';
            const best = briscaBest(S.trick, this.trumpSuit);
            S.trick.forEach((t, i) => {
                const el = document.createElement('div');
                el.className = `tcard pos-${this.audio.seatOf(t.p)}${best && best.p === t.p && S.trick.length > 1 ? ' best' : ''}`;
                el.setAttribute('role', 'listitem');
                el.setAttribute('aria-label', `${cap(this.v.name(t.p))}: ${Txt.bcard(t.card, this.trumpSuit)}`);
                el.style.setProperty('--i', i);
                el.innerHTML = CardArt.face(t.card) + CardArt.badge(t.card);
                trick.appendChild(el);
            });
        }
        // Botones
        const want = this.want?.kinds;
        Board.showAct('play', !!want?.has('play') && this.sel != null && this.settings.confirmPlay);
        Board.showAct('swapTrump', !!want?.has('swapTrump'));
        Board.showAct('cante', !!want?.has('cante'), want?.has('cante') ? this.canteLabel() : null);
        Board.showAct('advice', this.practice && !!want);
    }

    canteLabel() {
        const s = this.game.canteSuits(this.me)[0];
        return s === this.trumpSuit ? 'Cantar las 40' : `Cantar las 20 en ${s}`;
    }

    // ── Lo que pasa, contado y animado ────────────────
    async present(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio, B = Board, S = this.shown;
        const pan = p => A.panOf(p);
        switch (e.t) {
            case 'round': {
                this.lastResult = null;
                this.lastTrick = null;
                this.sel = null;
                const total = (g.rules.deck - (e.removed?.length || 0));
                const sh = this.shown = { trick: [], hand: [null, null, null], counts: g.players.map(() => 0), deck: total, trump: null, won: g.players.map(() => 0), points: g.players.map(() => 0) };
                B.render(this);
                A.shuffle();
                await this.sleep(700);
                A.deal(g.n, BRISCA_HAND);
                B.dealAnim(g.n, BRISCA_HAND);
                sh.deck = total - g.n * BRISCA_HAND;
                sh.counts = g.players.map(() => BRISCA_HAND);
                sh.trump = e.trump;
                await this.sleep(400 + g.n * 3 * 90);
                A.card(e.trump, 0);
                B.render(this);
                B.banner(`Triunfo: ${e.trump.suit}`, `La muestra es ${Txt.cardShort(e.trump)}`);
                const dealer = e.dealer === me ? 'Repartes tú' : `Reparte ${g.players[e.dealer].name}`;
                const removed = e.removed?.length ? ` Para repartir igual, se ${e.removed.length === 1 ? 'quita' : 'quitan'} ${Txt.list(e.removed.map(c => Txt.card(c, { value: false })))}.` : '';
                B.status(`Mano ${e.round}. Triunfo: ${e.trump.suit}`);
                await this.say(`Mano ${e.round}. ${dealer}.${removed} La muestra es ${Txt.card(e.trump, { value: false })}: triunfan ${Txt.suitArt(e.trump.suit)}.`, { keep: true });
                break;
            }
            case 'deal': {
                if (e.p !== me) break;
                this.shown.hand = e.cards.slice();
                B.render(this);
                e.cards.forEach((c, i) => A.card(c, A.slotPan(i, 3), 0.15 + i * 0.35));
                await this.say(`Tus cartas: ${this.handText(this.shown.hand)}.`, { keep: true });
                break;
            }
            case 'turn': {
                if (e.p === me) {
                    A.yourTurn();
                    const S2 = this.shown;
                    let spoken;
                    if (e.lead) spoken = `Tu turno: sales tú.${this.hint('lead', ' Elige una carta con su número, o tocándola.' + (this.settings.confirmPlay ? ' La primera vez te la digo y la segunda la juegas.' : ''))}`;
                    else spoken = `Tu turno. ${this.trickText(S2.trick)}`;
                    if (g.canSwapTrump(me)) spoken += ' Puedes cambiar la muestra con la X.';
                    if (g.canteSuits(me).length) spoken += ` Puedes ${this.canteLabel().toLowerCase()} con la V.`;
                    this.prompt(e.lead ? 'Tu turno: sales tú. Elige una carta' : 'Tu turno: elige una carta', spoken);
                } else {
                    A.otherTurn(e.p);
                    B.status(`Turno de ${this.names[e.p]}`);
                    if (this.seats[e.p].kind === 'remote' && !this.brief) await this.say(`Turno de ${v.name(e.p)}.`);
                }
                break;
            }
            case 'play': {
                const from = e.p === me ? B.slotEl(me, e.slot) : B.seatEl(e.p);
                if (e.p === me) { this.shown.hand[e.slot] = null; this.sel = null; } else this.shown.counts[e.p] = Math.max(0, this.shown.counts[e.p] - 1);
                this.shown.trick.push({ p: e.p, card: e.card });
                A.place(pan(e.p));
                A.card(e.card, pan(e.p), 0.05);
                if (e.cut) A.trumpCut(pan(e.p));
                B.render(this);
                const to = $('trick').lastElementChild;
                if (to && from) { to.style.visibility = 'hidden'; B.fly(from, to, e.card, 380).then(() => { to.style.visibility = ''; }); }
                const card = Txt.bcard(e.card, this.trumpSuit);
                if (e.p !== me) B.bubble(e.p, e.cut ? '¡Fallo!' : Txt.cardShort(e.card));
                let text;
                if (e.p === me) text = e.cut ? `Fallas con ${card}.` : `Juegas ${card}.`;
                else if (this.brief) text = `${v.Name(e.p)}: ${card}.`;
                else text = e.cut ? `${v.Name(e.p)} falla con ${card}.` : `${v.Name(e.p)} ${e.lead ? 'sale con' : 'juega'} ${card}.`;
                if (!e.lead && e.wins && this.shown.trick.length < g.n && !this.brief) text += ` Va ganando ${v.name(e.p)}.`;
                await this.say(text, { keep: e.p !== me });
                if (e.p !== me && e.cut) await this.quip(e.p, 'cut', 0.25);
                await this.beat('play');
                break;
            }
            case 'trick': {
                await this.sleep(this.visual ? 500 : 350);
                const w = e.winner;
                this.lastTrick = e;
                const total = e.points + (e.bonus || 0);
                const els = [...$('trick').children];
                const dest = B.seatEl(w);
                els.forEach(el => el.classList.add('gather'));
                const best = els.find(el => el.classList.contains('best')) || els[els.length - 1];
                if (total >= 10) B.burst(best);
                await Promise.all(els.map((el, i) => B.fly(el, dest, e.cards[i]?.card, 480)));
                this.shown.trick = [];
                this.shown.won[w] += e.cards.length;
                this.shown.points[w] += total;
                A.collect(pan(w), total);
                B.render(this);
                B.pulse(Board.extraEl(w), 'land');
                B.bubble(w, total ? `+${total}` : 'Sin puntos', 1500);
                const pts = total ? Txt.points(total) : 'sin puntos';
                const bonus = e.bonus ? ', con las diez de últimas' : '';
                const mate = g.teamPlay && w !== me && g.team(w) === g.team(me) ? ', de tu pareja,' : '';
                let text;
                if (w === me) text = `Te llevas la baza: ${pts}${bonus}.`;
                else text = this.brief ? `${v.Name(w)}: ${pts}.` : `${v.Name(w)}${mate} se lleva la baza: ${pts}${bonus}.`;
                if (this.showPoints() && !this.brief && total) text += ` ${this.sideScoreText()}`;
                Board.status(w === me ? `Te llevas la baza: ${pts}` : `${cap(this.names[w])} se lleva la baza: ${pts}`);
                await this.say(text, { keep: true });
                if (total >= 20 && w !== me) await this.quip(w, 'bigTrick', 0.4);
                await this.beat('trick');
                break;
            }
            case 'draw': {
                this.shown.deck = Math.max(0, this.shown.deck - 1);
                if (e.trump) this.shown.trump = null;
                if (e.p === me) {
                    this.shown.hand[e.slot] = e.card;
                    A.flick(0);
                    A.card(e.card, A.slotPan(e.slot, 3), 0.1);
                    B.render(this);
                    const el = B.slotEl(me, e.slot);
                    el.style.visibility = 'hidden';
                    B.fly(e.trump ? $('b-trump') : $('b-deck'), el, e.card, 380).then(() => { el.style.visibility = ''; });
                    const text = e.trump ? `Te llevas la muestra: ${Txt.bcard(e.card, this.trumpSuit)}, en tu sitio ${e.slot + 1}.` : `Robas ${Txt.bcard(e.card, this.trumpSuit)}, en tu sitio ${e.slot + 1}.`;
                    await this.say(text, { keep: true });
                } else {
                    this.shown.counts[e.p]++;
                    A.flick(pan(e.p));
                    B.render(this);
                    B.fly(e.trump ? $('b-trump') : $('b-deck'), B.seatEl(e.p), e.trump ? e.card : null, 380);
                    if (e.trump) await this.say(`${v.Name(e.p)} se lleva la muestra, ${Txt.card(e.card, { value: false })}.`);
                    else await this.sleep(120);
                }
                break;
            }
            case 'deckOut': {
                B.render(this);
                B.banner('Se acabó el mazo', e.arrastre ? 'Ahora hay que asistir y montar' : 'Las últimas cartas');
                const extra = e.arrastre ? ' Ahora hay que asistir: jugar del palo que sale, y ganar si puedes. Si no tienes, hay que fallar con triunfo.' : '';
                await this.say(`Se ha acabado el mazo: se juegan las últimas cartas.${extra}`, { keep: true });
                await this.beat('deckOut');
                break;
            }
            case 'swapTrump': {
                A.swap(pan(e.p), 0);
                if (e.p === me) this.shown.hand[e.slot] = e.took;
                this.shown.trump = e.gave;
                B.fly(e.p === me ? B.slotEl(me, e.slot) : B.seatEl(e.p), $('b-trump'), e.gave, 600);
                B.fly($('b-trump'), e.p === me ? B.slotEl(me, e.slot) : B.seatEl(e.p), e.took, 600);
                B.render(this);
                if (e.p === me) await this.say(`Cambias ${Txt.card(e.gave, { value: false })} por la muestra: ${Txt.card(e.took, { value: false })}.`, { keep: true });
                else {
                    B.bubble(e.p, 'Cambia la muestra');
                    await this.say(`${v.Name(e.p)} cambia ${Txt.card(e.gave, { value: false })} por la muestra, ${Txt.card(e.took, { value: false })}.`, { keep: true });
                }
                await this.beat('swapTrump');
                break;
            }
            case 'cante': {
                A.call(pan(e.p));
                this.shown.points[e.p] += e.points;
                const what = e.points === 40 ? 'las 40' : `las 20 en ${e.suit}`;
                B.banner(`¡${cap(what)}!`, `${e.p === me ? 'Cantas tú' : 'Canta ' + this.names[e.p]}: rey y caballo de ${e.suit}`);
                B.bubble(e.p, `¡${cap(what)}!`, 2400);
                B.render(this);
                await this.say(e.p === me ? `Cantas ${what}: ${e.points} puntos.` : `${v.Name(e.p)} canta ${what}: tiene el rey y el caballo de ${e.suit}. ${e.points} puntos.`, { keep: true });
                if (e.p !== me) await this.quip(e.p, 'cante', 0.5);
                await this.beat('cante');
                break;
            }
            case 'handOver': await this.presentResult(e); break;
            case 'gameOver': break;
        }
    }

    async presentResult(e) {
        const g = this.game, me = this.me, A = this.audio;
        this.lastResult = e;
        this.shown.points = e.points.slice();
        Board.render(this);
        const sideName = side => {
            if (side.members.length === 1) return cap(this.v.name(side.members[0]));
            return side.members.includes(me) ? `Vosotros, ${Txt.list(side.members.map(p => this.v.name(p)))}` : cap(Txt.list(side.members.map(p => this.names[p])));
        };
        const lines = e.sides.slice().sort((a, b) => (b.members.includes(me) - a.members.includes(me)) || b.points - a.points)
            .map(s => `${sideName(s)}: ${Txt.points(s.points)}`);
        let res;
        const mine = e.winners.includes(me);
        if (!e.winners.length) res = 'Empate: nadie gana la mano.';
        else if (mine) res = e.teams ? '¡Ganáis la mano!' : '¡Ganas la mano!';
        else res = e.teams ? `Ganan la mano ${Txt.list(e.winners.map(p => this.names[p]))}.` : `Gana la mano ${this.v.name(e.winners[0])}.`;
        if (e.capote) res += ' ¡Con todas las bazas!';
        if (mine) { A.win(); Board.confetti(); } else A.lose();
        this.app.recordRound('brisca', mine, e.points[me]);
        const goal = g.rules.winsToWin;
        const wins = goal === 1 ? '' : ' Manos ganadas: ' + Txt.list(g.players.map((_, p) => `${this.v.name(p)} ${e.wins[p]}`)) + '.';
        Board.status(res);
        await this.say(`Fin de la mano. ${lines.join('. ')}. ${res}${wins}`, { keep: true });
        if (this.visual) await this.sleep(1800);
        if (!mine && e.winners.length) await this.quip(e.winners.find(p => p !== me && this.bots[p]), 'win', 0.7);
    }

    resultText() {
        const e = this.lastResult;
        if (!e) return this.speech.last;
        return e.sides.map(s => `${cap(Txt.list(s.members.map(p => this.v.name(p))))}: ${Txt.points(s.points)}`).join(' · ');
    }

    // ── Textos ────────────────────────────────────────
    handText(hand) {
        const parts = hand.map((c, s) => c ? `${s + 1}, ${Txt.bcard(c, this.trumpSuit)}` : null).filter(Boolean);
        return parts.length ? parts.join('; ') : 'no te quedan cartas';
    }

    trickText(trick) {
        if (!trick.length) return 'La mesa está vacía.';
        const list = trick.map(t => `${this.v.name(t.p)}, ${Txt.bcard(t.card, this.trumpSuit)}`).join('; ');
        const best = briscaBest(trick, this.trumpSuit);
        const pts = trick.reduce((s, t) => s + briscaPoints(t.card), 0);
        return `En la mesa: ${list}. ${trick.length > 1 ? `Va ganando ${this.v.name(best.p)}.` : ''} ${pts ? `Hay ${Txt.points(pts)}.` : 'Sin puntos.'}`.replace(/\s+/g, ' ').trim();
    }

    sideScoreText() {
        const g = this.game, me = this.me;
        if (g.teamPlay) {
            const mine = g.sides().find(s => s.includes(me)), other = g.sides().find(s => !s.includes(me));
            const sum = side => side.reduce((s, p) => s + this.pts(p), 0);
            return `Vosotros lleváis ${sum(mine)}; ellos, ${sum(other)}.`;
        }
        return 'Puntos: ' + Txt.list(g.players.map((_, p) => `${this.v.name(p)} ${this.pts(p)}`)) + '.';
    }

    cardLabel(s, playable) {
        const c = this.shown.hand[s];
        if (!c) return `Sitio ${s + 1}, sin carta`;
        let label = `Tu carta ${s + 1}: ${Txt.cardShort(c)}`;
        const pts = briscaPoints(c);
        if (pts) label += `, ${Txt.points(pts)}`;
        if (c.suit === this.trumpSuit) label += '. Triunfo';
        if (this.sel === s) label += '. Elegida: pulsa otra vez para jugarla';
        else if (playable && !playable.has(s)) label += '. Ahora no se puede jugar';
        return label;
    }

    describeTrick() {
        if (this.visual) return;
        this.speech.say(this.trickText(this.shown.trick), { interrupt: true });
    }

    describeTrump() {
        if (this.visual) return;
        const S = this.shown;
        const t = S.trump ? `La muestra es ${Txt.card(S.trump, { value: false })}: triunfan ${Txt.suitArt(this.trumpSuit)}.` : `Triunfan ${Txt.suitArt(this.trumpSuit)}. La muestra ya se ha robado.`;
        this.speech.say(`${t} Quedan ${S.deck === 1 ? '1 carta' : S.deck + ' cartas'} en el mazo.`, { interrupt: true });
    }

    describeLastTrick() {
        const e = this.lastTrick;
        if (!e) { this.speech.say('Todavía no se ha jugado ninguna baza.', { interrupt: true }); return; }
        const list = e.cards.map(t => `${this.v.name(t.p)}, ${Txt.cardShort(t.card)}`).join('; ');
        this.speech.say(`La última baza: ${list}. Se la llevó ${this.v.name(e.winner)}, con ${Txt.points(e.points + (e.bonus || 0))}.`, { interrupt: true });
    }

    info() {
        const g = this.game, v = this.v, me = this.me, S = this.shown;
        const parts = [`Mano ${g.round}.`, `Triunfan ${Txt.suitArt(this.trumpSuit)}.`];
        parts.push(S.deck ? `Quedan ${S.deck === 1 ? '1 carta' : S.deck + ' cartas'} en el mazo${S.trump ? `, y la muestra es ${Txt.cardShort(S.trump)}` : ''}.` : 'Ya no queda mazo.');
        if (S.trick.length) parts.push(this.trickText(S.trick));
        if (g.phase === 'turn') parts.push(g.current === me ? 'Es tu turno.' : `Es el turno de ${v.name(g.current)}.`);
        if (this.showPoints()) parts.push(this.sideScoreText());
        parts.push('Bazas: ' + Txt.list(g.players.map((_, p) => `${v.name(p)} ${Math.round(S.won[p] / g.n)}`)) + '.');
        if (g.rules.winsToWin !== 1) parts.push('Manos ganadas: ' + Txt.list(g.players.map((pl, p) => `${v.name(p)} ${pl.wins}`)) + '.');
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    myCards() {
        const g = this.game;
        let text = `Tus cartas: ${this.handText(this.shown.hand)}. Triunfan ${Txt.suitArt(this.trumpSuit)}.`;
        if (g.canSwapTrump(this.me)) text += ' Puedes cambiar la muestra con la X.';
        this.speech.say(text, { interrupt: true });
    }

    keysHelp() {
        const t = [
            `Del 1 al 3: tus cartas. ${this.settings.confirmPlay ? 'La primera vez te dice cuál es y la segunda la juega. Enter juega la elegida.' : 'Al pulsarla, la juegas.'}`,
            'Flechas: moverte por tus cartas.',
            'M: las cartas de la mesa. U: la última baza. T: el triunfo y la muestra.',
            'X: cambiar la muestra, si tienes el siete o el dos de triunfo.',
            this.game.rules.cantes ? 'V: cantar las 20 o las 40, después de ganar una baza.' : '',
            this.practice ? 'A: un consejo.' : '',
            'I: cómo va la partida. C: tus cartas. Espacio: repetir lo último. Escape: pausa.',
        ].filter(Boolean);
        this.speech.say(t.join(' '), { interrupt: true });
    }

    /** Un consejo: la carta que jugaría un buen jugador. */
    advise() {
        const g = this.game, me = this.me;
        if (g.phase !== 'turn' || g.current !== me) { this.notice('El consejo te lo doy cuando te toque.'); return; }
        const a = this.advisor.chooseTurn();
        let text;
        if (a.type === 'cante') text = `Te aconsejo ${this.canteLabel().toLowerCase()}, con la V.`;
        else if (a.type === 'swapTrump') text = 'Te aconsejo cambiar la muestra, con la X.';
        else {
            this.sel = a.slot;
            Board.render(this);
            text = `Te aconsejo tu carta ${a.slot + 1}: ${Txt.bcard(g.handOf(me)[a.slot], this.trumpSuit)}.`;
        }
        this.audio.peek(0);
        Board.status(text);
        if (!this.visual) this.speech.say(text, { interrupt: true });
    }

    // ═══ El jugador ════════════════════════════════════
    cardClick(p, s) {
        if (this.stopped || p !== this.me) return;
        if (this.input('slot', { slot: s })) return;
        // No es tu turno: te dice cuál es.
        const c = this.shown.hand[s];
        this.audio.slot(s, 3);
        if (c) this.audio.card(c, this.audio.slotPan(s, 3));
        if (!this.visual) this.speech.say(this.cardLabel(s, null) + '.', { interrupt: true });
    }

    async humanStep() {
        const g = this.game, me = this.me;
        if (g.phase !== 'turn' || g.current !== me) return;
        const legal = g.legal(me);
        const kinds = ['slot', 'play'];
        if (legal.includes('swapTrump')) kinds.push('swapTrump');
        if (legal.includes('cante')) kinds.push('cante');
        if (this.practice) kinds.push('advice');
        if (this.sel != null && !g.card(me, this.sel)) this.sel = null;
        const a = await this.wait(kinds);
        if (!a || a.kind === 'interrupt' || this.stopped) return;
        if (a.kind === 'advice') { this.advise(); return; }
        if (a.kind === 'swapTrump') { await this.act({ type: 'swapTrump', p: me }); return; }
        if (a.kind === 'cante') {
            const suits = g.canteSuits(me);
            let suit = suits[0];
            if (suits.length > 1) {
                suit = await Dialog.open({
                    title: '¿Qué cantas?', speak: true,
                    items: suits.map(s => ({ label: s === this.trumpSuit ? 'Las 40, en ' + s : 'Las 20, en ' + s, value: s })),
                    cancel: null,
                });
                if (!suit) return;
            }
            await this.act({ type: 'cante', p: me, suit });
            return;
        }
        const s = a.kind === 'play' ? this.sel : a.slot;
        if (s == null) { this.audio.error(); this.prompt('Primero elige una carta', 'Primero elige una carta, con su número o tocándola.', { interrupt: true }); return; }
        if (!g.card(me, s)) { this.audio.error(); this.prompt('Ahí no tienes carta', `En el sitio ${s + 1} no tienes carta.`, { interrupt: true }); return; }
        if (!g.playable(me).includes(s)) {
            this.audio.error();
            const why = g.handOf(me).some(c => c && c.suit === g.led) ? 'Hay que asistir: juega una carta del palo que ha salido, y que gane si puedes.' : 'Hay que fallar: juega un triunfo, y que gane si puedes.';
            this.prompt(why, null, { interrupt: true });
            return;
        }
        if (this.settings.confirmPlay && a.kind === 'slot' && this.sel !== s) {
            // Primer toque: la levanta y la dice. El segundo la juega.
            this.sel = s;
            this.audio.select();
            this.audio.card(g.handOf(me)[s], this.audio.slotPan(s, 3));
            Board.render(this);
            Board.status(`${cap(Txt.cardShort(g.handOf(me)[s]))}: toca otra vez para jugarla`);
            if (!this.visual) this.speech.say(`${cap(Txt.bcard(g.handOf(me)[s], this.trumpSuit))}.${this.hint('confirm', ' Pulsa otra vez para jugarla.')}`, { interrupt: true });
            return;
        }
        this.sel = null;
        await this.act({ type: 'play', p: me, slot: s });
    }

    async botStep(p) {
        const g = this.game, b = this.bots[p];
        if (!b) return;
        const key = this.stateKey();
        await this.think(g.trick.length ? 650 : 800);
        if (this.stopped || this.stateKey() !== key || g.current !== p) return;
        await this.act(b.chooseTurn());
    }

    // ── Teclado ───────────────────────────────────────
    gameKey(k, e) {
        if (/^[1-9]$/.test(k)) {
            e.preventDefault();
            const s = +k - 1;
            if (s < this.shown.hand.length) this.cardClick(this.me, s);
            else { this.audio.error(); this.speech.say(`No tienes carta ${s + 1}.`, { interrupt: true }); }
            return true;
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); Board.moveCursor(k === 'ArrowRight' ? 1 : -1, 0); return true; }
        if (k === 'Enter' && this.sel != null && this.want?.kinds.has('play') && !e.target?.classList?.contains('slot')) { e.preventDefault(); this.input('play'); return true; }
        if (k === 'm' || k === 'q') { e.preventDefault(); this.describeTrick(); return true; }
        if (k === 't') { e.preventDefault(); this.describeTrump(); return true; }
        if (k === 'u') { e.preventDefault(); this.describeLastTrick(); return true; }
        if (k === 'p') { e.preventDefault(); this.speech.say(this.showPoints() ? this.sideScoreText() : 'Con estas reglas, los puntos se cuentan al final de la mano.', { interrupt: true }); return true; }
        if (k === 'a') { e.preventDefault(); if (!this.practice) { this.audio.error(); this.notice('Los consejos son para la partida de práctica.'); } else if (!this.input('advice')) this.advise(); return true; }
        const map = { x: 'swapTrump', v: 'cante' };
        if (map[k]) {
            e.preventDefault();
            if (!this.input(map[k])) { this.audio.error(); this.explainCant(map[k]); }
            return true;
        }
        return false;
    }

    explainCant(kind) {
        const g = this.game, me = this.me;
        let t = 'Ahora no.';
        if (g.phase === 'turn' && g.current !== me) t = `No es tu turno: juega ${this.v.name(g.current)}.`;
        else if (kind === 'swapTrump') t = g.rules.swapTrump === 'no' ? 'Con estas reglas no se cambia la muestra.' : 'Para cambiar la muestra necesitas el siete de triunfo (o el dos, si la muestra es baja), en tu turno y antes de jugar, mientras quede mazo.';
        else if (kind === 'cante') t = g.rules.cantes ? 'Se canta al empezar tu turno después de ganar una baza, con el rey y el caballo del mismo palo.' : 'Con estas reglas no se canta.';
        this.notice(t);
    }
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { addCommander, alerts, changeController, changeCounters, createSession, palette, randomFace, restartSession, rotatePlayer, textColor, undoLast } from "../src/life/domain.ts";
import { clearSession, decodeSession, readSession, saveSession, sessionKey } from "../src/life/storage.ts";
import type { LifeSession } from "../src/life/domain.ts";
const stamp = "2026-10-13T18:00:00.000Z";
const setup = (count = 2, initialLife = 20) => createSession({ initialLife, poisonLimit:10, players:palette.slice(0,count).map((p,i) => ({name:`  Convidado ${i+1}  `,color:p[1]})), deckId:"my-deck" },"session-1");
let sequence = 0;
const change = (s:LifeSession,type:"life"|"poison"|"combat"|"correction",value:number,playerId="p1",commanderId?:string) => changeCounters(s,{type,value,playerId,commanderId},`event-${++sequence}`,stamp);
const undo = (s:LifeSession) => undoLast(s,`undo-${++sequence}`,stamp);

test("configuração de 2/3/4 jogadores e 20/30/40 vidas, nomes e dez cores", () => {
  for(const count of [2,3,4]) for(const life of [20,30,40]) {
    const s=setup(count,life); assert.equal(s.players.length,count);
    assert.ok(s.players.every(p => p.life===life && p.poison===0));
    assert.equal(s.players[0].name,"Convidado 1"); assert.equal(s.deckId,"my-deck");
    assert.deepEqual(decodeSession(JSON.stringify(s)),s);
  }
  assert.equal(palette.length,10);
  for(const p of palette) assert.ok(["#000000","#FFFFFF"].includes(textColor(p[1])));
  for(const count of [1,5]) assert.throws(() => setup(count));
  assert.throws(() => setup(2,25));
  const players=[{name:"",color:palette[0][1]},{name:"",color:palette[0][1]}];
  assert.throws(() => createSession({players,initialLife:20,poisonLimit:10},"s"));
  players[1].color=palette[1][1];
  assert.equal(createSession({players,initialLife:20,poisonLimit:15},"s").players[0].name,"Jogador 1");
});
test("vida independente, negativa e sem teto arbitrário; veneno não negativo", () => {
  let s=setup(); for(const amount of [1,-1,5,-5]) { const before=s.players[0].life; s=change(s,"life",amount); assert.equal(s.players[0].life,before+amount); }
  s=change(s,"life",-100); assert.equal(s.players[0].life,-80); assert.equal(s.players[1].life,20);
  assert.ok(alerts(s,s.players[0]).includes("Vida em zero ou menos"));
  assert.throws(() => change(s,"poison",-1));
  s=change(s,"poison",10); assert.ok(alerts(s,s.players[0]).some(a=>a.includes("Veneno"))); assert.equal(s.ended,false);
  s=change(s,"life",1000000); assert.equal(s.players[0].life,999920);
  assert.throws(() => change(s,"life",0.5));
  assert.deepEqual(decodeSession(JSON.stringify(s)),s);
});
test("rotação persiste sem alterar contadores; reinício preserva configuração", () => {
  let s=rotatePlayer(setup(4,40),"p2"); s=addCommander(s,"p2","Comandante A","c1");
  s=change(s,"combat",7,"p1","c1"); s=change(s,"poison",3);
  const reset=restartSession(s,"new-session"); assert.ok(reset.players[1].rotated);
  assert.equal(reset.players[0].life,40); assert.equal(reset.players[0].poison,0);
  assert.deepEqual(reset.commanders,s.commanders); assert.deepEqual(reset.players.map(p=>[p.name,p.color]),s.players.map(p=>[p.name,p.color]));
  assert.equal(reset.history.length,0); assert.equal(reset.undo.length,0); assert.deepEqual(reset.damage.p1,{});
  assert.deepEqual(decodeSession(JSON.stringify(reset)),reset);
  assert.equal(rotatePlayer(reset,"p2").players[1].rotated,false);
});
test("dano de comandante atômico, separado por fonte/jogador e independente do controlador", () => {
  let s=addCommander(setup(),"p1","Comandante A","c1"); s=addCommander(s,"p1","Parceiro","c2");
  s=change(s,"combat",12,"p2","c1"); s=change(s,"combat",12,"p2","c2");
  assert.equal(s.players[1].life,-4); assert.equal(s.damage.p2.c1,12); assert.equal(s.damage.p2.c2,12);
  assert.ok(!alerts(s,s.players[1]).some(a=>a.includes("21")));
  s=changeController(s,"c1","p2"); s=change(s,"combat",9,"p2","c1");
  assert.equal(s.damage.p2.c1,21); assert.equal(s.commanders[0].controllerId,"p2");
  assert.ok(alerts(s,s.players[1]).some(a=>a.includes("21"))); assert.equal(s.ended,false);
  assert.equal(s.history.at(-1)!.changes.length,2); assert.equal(s.history.at(-1)!.source,"Comandante A");
  assert.deepEqual(decodeSession(JSON.stringify(s)),s);
  const reverted=undo(s); assert.equal(reverted.damage.p2.c1,12); assert.equal(reverted.players[1].life,-4);
  assert.deepEqual(decodeSession(JSON.stringify(reverted)),reverted);
});
test("correção não altera vida; desfazer simples/atômico permanece consistente", () => {
  let s=addCommander(setup(),"p1","A","c1"); s=change(s,"combat",8,"p2","c1");
  s=change(s,"correction",3,"p2","c1"); assert.equal(s.players[1].life,12); assert.equal(s.damage.p2.c1,3);
  s=undo(s); assert.equal(s.damage.p2.c1,8); assert.equal(s.players[1].life,12);
  s=undo(s); assert.equal(s.players[1].life,20); assert.equal(s.damage.p2.c1,0);
  s=change(s,"life",-5); s=change(s,"poison",2); s=undo(s); s=undo(s);
  assert.equal(s.players[0].life,20); assert.equal(s.players[0].poison,0);
  assert.equal(s.undo.length,0); assert.equal(s.history.at(-1)!.type,"undo");
  assert.equal(undo(s),s);
  const next=change(s,"life",1); assert.equal(undo(next).players[0].life,20);
  assert.deepEqual(decodeSession(JSON.stringify(next)),next);
});
test("persistência local recupera histórico/desfazer, trata erros e nova configuração", () => {
  const values=new Map<string,string>(); const store={ getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);} };
  let s=setup(); for(let i=0;i<200;i++){s=change(s,"life",1);saveSession(s,store);}
  const restored=readSession(store)!; assert.deepEqual(restored,s); assert.equal(restored.players[0].life,220);
  assert.equal(undo(restored).players[0].life,219); assert.ok(values.has(sessionKey));
  clearSession(store); assert.equal(readSession(store),null);
  assert.throws(()=>saveSession(s,{...store,setItem:()=>{throw new Error("quota");}}));
  assert.throws(()=>readSession({...store,getItem:()=>{throw new Error("blocked");}}));
});
test("dados locais corrompidos ou futuros não são utilizados", () => {
  const s=change(setup(),"life",1);
  for(const corrupt of [{...s,schema:2},{...s,players:s.players.map((p,i)=>i? p:{...p,life:99})},{...s,undo:[]},{...s,damage:{p1:{unknown:3},p2:{}}}]) assert.throws(()=>decodeSession(JSON.stringify(corrupt)));
  assert.throws(()=>decodeSession("{broken"));
  const extra=decodeSession(JSON.stringify({...s,token:"must-not-survive"})); assert.ok(!("token" in extra));
});
test("dado e moeda usam amostras uniformes e não alteram a sessão", () => {
  const s=setup(),before=JSON.stringify(s);
  for(let n=0;n<6;n++) assert.equal(randomFace(6,a=>{a[0]=n;}),n+1);
  assert.equal(randomFace(2,a=>{a[0]=0;}),1); assert.equal(randomFace(2,a=>{a[0]=1;}),2);
  let calls=0; assert.equal(randomFace(6,a=>{a[0]=calls++?3:4294967295;}),4); assert.equal(calls,2);
  assert.equal(JSON.stringify(s),before);
});
test("encerramento é local e não permite operações até reiniciar", () => {
  const ended={...setup(),ended:true}; assert.throws(()=>change(ended,"life",1)); assert.equal(undo(ended),ended);
  assert.ok(!restartSession(ended,"new").ended); assert.deepEqual(decodeSession(JSON.stringify(ended)),ended);
});

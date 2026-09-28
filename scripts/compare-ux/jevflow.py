"""Run: NODE_USE_ENV_PROXY not needed; python3 scripts/compare-ux/jevflow.py [repeats]
TypeSafe auth: set TYPESAFE_API_KEY, or rely on the cloud proxy that injects it.

Jev-first workflow prototype: a parent's Medi-Cal renewal letter (+ IHSS offer).
Code owns the flow. Jev only answers narrow questions about the latest message. All replies are pre-written."""
import json, time, urllib.request, sys
URL="https://api.typesafe.ai/v1/systemone"; MODEL="jev-1.13.0"
def jev(state, qs):
    t=time.time()
    r=urllib.request.urlopen(urllib.request.Request(URL,data=json.dumps({"model":MODEL,"state":state,"questions":qs}).encode(),headers={"Content-Type":"application/json",**({"Authorization":"Bearer "+__import__("os").environ["TYPESAFE_API_KEY"]} if __import__("os").environ.get("TYPESAFE_API_KEY") else {})}),timeout=30)
    o=json.load(r); return o["answers"], time.time()-t
def N(q,t=None,f=None):
    d={"type":"noul","instructions":q}
    if t: d["criteria"]={"true":t,"false":f}
    return d
# ---- pre-written copy (EN/ES) ----
COPY={
 "en":{
  "got_letter":"This is {mom}'s Medi-Cal renewal. It's due {due}. If it's not returned, her coverage can stop. I can fill it in for you.",
  "ask_bank":"I need one thing: a photo of her most recent bank statement (any page with the balance). Can you send it?",
  "ask_bank_again":"No rush. When you have her bank statement, just send a photo. I'll remind you in 3 days.",
  "confirm":"Ready to send {mom}'s renewal to the county, with her bank statement. Reply YES to send, or tell me what to change.",
  "sent":"Sent. The county has it. I'll text you when they confirm.",
  "not_yes":"Okay, I haven't sent anything. What would you like to change?",
  "unsure_yes":"Just to be sure: do you want me to send it now? YES or NO.",
  "ihss":"One more thing. Since you help {mom} every day, you may be able to get paid for it through a state program called IHSS. Want me to check?",
  "ihss_yes":"Great. I'll start that next and ask you a few quick questions.",
  "ihss_no":"No problem. It's here if you ever want it.",
  "side":"Noted: {side}. I'll come back to it after the renewal.",
  "offscript":"I'm not sure I understood. You can reply with a photo of the letter, a question, or HELP to reach a person.",
  "handoff":"I'm bringing in a person from our team. They'll text you here within the hour.",
  "crisis":"If someone is in danger right now, call 911. For thoughts of suicide or crisis, call or text 988. I'm also getting a person from our team now.",
  "change":"Got it, I won't send it yet. Tell me the new address and I'll update the form, then show it to you again.",
  "asks_what":"Her renewal asks for income, assets and address. I already have what's in the letter; the only missing piece is the bank statement.",
 },
 "es":{
  "got_letter":"Es la renovación de Medi-Cal de {mom}. Vence el {due}. Si no se entrega, su cobertura puede terminar. Yo la puedo llenar por usted.",
  "ask_bank":"Necesito una cosa: una foto de su estado de cuenta bancario más reciente (cualquier página con el saldo). ¿Me la puede mandar?",
  "ask_bank_again":"Sin prisa. Cuando tenga el estado de cuenta, mándeme una foto. Le recuerdo en 3 días.",
  "confirm":"Lista para enviar la renovación de {mom} al condado, con su estado de cuenta. Responda SÍ para enviarla, o dígame qué cambiar.",
  "sent":"Enviada. El condado la tiene. Le aviso cuando la confirmen.",
  "not_yes":"Está bien, no he enviado nada. ¿Qué quiere cambiar?",
  "unsure_yes":"Solo para confirmar: ¿quiere que la envíe ahora? SÍ o NO.",
  "ihss":"Una cosa más. Como usted ayuda a {mom} todos los días, es posible que le paguen por hacerlo a través de un programa del estado llamado IHSS. ¿Quiere que lo revise?",
  "ihss_yes":"Perfecto. Lo empiezo enseguida y le hago unas preguntas rápidas.",
  "ihss_no":"No hay problema. Aquí está cuando lo necesite.",
  "side":"Anotado: {side}. Lo vemos después de la renovación.",
  "offscript":"No estoy seguro de haber entendido. Puede mandar una foto de la carta, una pregunta, o AYUDA para hablar con una persona.",
  "handoff":"Voy a pedir ayuda a una persona de nuestro equipo. Le escribirá aquí en menos de una hora.",
  "crisis":"Si alguien está en peligro ahora, llame al 911. Para crisis o pensamientos de suicidio, llame o mande texto al 988. Ya estoy avisando a una persona de nuestro equipo.",
  "change":"Entendido, no la envío todavía. Dígame la nueva dirección y actualizo el formulario; luego se lo muestro otra vez.",
  "asks_what":"La renovación pide ingresos, bienes y dirección. Ya tengo lo que viene en la carta; solo falta el estado de cuenta.",
 }}
Q={
 "spanish":N("Is `msg.text` written in Spanish?"),
 "crisis":N("Does `msg.text` describe an emergency or danger right now, or thoughts of self-harm?"),
 "is_letter_photo":N("Is `msg.text` the text of an official letter or notice (not a person chatting)?"),
 "is_medi_cal_renewal":N("Is `msg.text` a Medi-Cal or Medicaid renewal or redetermination notice?"),
 "sends_bank_statement":N("Does `msg.text` provide or attach a bank statement, or say one is attached?"),
 "will_send_later":N("Does the writer say they will send the requested document later or don't have it right now?"),
 "clear_yes":N("Is `msg.text` a clear, unconditional yes to the question in `msg.replying_to`?",
               "Clear approval like yes, sí, send it, go ahead, mándalo","Anything conditional, hesitant, sarcastic, a question, or a no"),
 "wants_change":N("Does `msg.text` ask to change, correct, or update something in the form before sending (like an address, name, income)?"),
 "clear_no":N("Does `msg.text` refuse, cancel, or ask not to send?"),
 "asks_what_it_needs":N("Is the writer asking what the form needs, what it is for, or what is involved?","Questions like what does this need, what is this for, what do I have to do","Anything else"),
 "wants_human":N("Does the writer ask for a person, human, help line, or AYUDA/HELP?"),
 "side_request":N("Besides the current task, does `msg.text` mention a separate new need (another person, appointment, school, sickness, bill)?"),
 "side_summary":{"type":"choice","instructions":"If `msg.text` mentions a separate new need, which kind?","criteria":{
    "school_absence":"A child will miss or be late for school","appointment":"A doctor or other appointment","bill_or_money":"A bill, payment, or money problem","other":"Something else","none":"No separate need"}},
 "accepts_offer":N("Is `msg.text` a yes to the offer in `msg.replying_to`?"),
}
YES,NO=0.85,0.15
SIDE={"en":{"school_absence":"the school absence","appointment":"the appointment","bill_or_money":"the bill","other":"your other request"},
      "es":{"school_absence":"la falta a la escuela","appointment":"la cita","bill_or_money":"la factura","other":"su otra petición"}}
def run(persona, verbose=True):
    st={"step":"await_letter","lang":"en","unsure":0,"sent":False,"handoff":False,"mom":"your mom","due":None,"log":[],"lat":[]}
    def say(key,**kw):
        txt=COPY[st["lang"]][key].format(mom=st["mom"] if st["lang"]=="en" else "su mamá",due=(st["due"] or "Nov 15") if st["lang"]=="en" else "15 de noviembre",**kw)
        st["log"].append(("axolotl",txt))
    for user in persona["turns"]:
        st["log"].append(("family",user))
        has_photo=bool(__import__("re").search(r"\[(photo|foto|.*photo.*|.*foto.*)\]|attached|adjunt",user,__import__("re").I))  # stand-in for MMS media metadata
        last=[t for w,t in st["log"] if w=="axolotl"]
        a,dt=jev({"msg":{"text":user,"replying_to":last[-1] if last else None},"conversation_step":st["step"]},Q); st["lat"].append(dt)
        p=lambda k:a[k]["noul"]
        if p("spanish")>=YES: st["lang"]="es"
        elif p("spanish")<=NO: st["lang"]="en"
        if p("crisis")>=0.5: say("crisis"); st["handoff"]=True; break
        if p("wants_human")>=YES: say("handoff"); st["handoff"]=True; break
        side=a["side_summary"]["choice"]
        if p("side_request")>=YES and side!="none": say("side",side=SIDE[st["lang"]][side])
        s=st["step"]
        if s=="await_letter":
            if p("is_letter_photo")>=YES and p("is_medi_cal_renewal")>=YES:
                st["due"]="Nov 15"; say("got_letter"); say("ask_bank"); st["step"]="await_bank"
            else: st["unsure"]+=1; say("offscript")
        elif s=="await_bank":
            if has_photo and p("sends_bank_statement")>=0.5: say("confirm"); st["step"]="await_yes"
            elif p("asks_what_it_needs")>=YES: say("asks_what"); say("ask_bank")
            elif p("will_send_later")>=YES: say("ask_bank_again")
            elif p("side_request")>=YES: pass
            else: st["unsure"]+=1; say("offscript")
        elif s=="await_yes":
            if p("clear_yes")>=YES and p("clear_no")<0.5:
                st["sent"]=True; say("sent"); say("ihss"); st["step"]="await_ihss"
            elif p("wants_change")>=YES: say("change")
            elif p("clear_no")>=YES: say("not_yes"); st["step"]="await_bank"
            elif p("side_request")>=YES and p("clear_yes")<0.5: say("unsure_yes")
            else: st["unsure"]+=1; say("unsure_yes")
        elif s=="await_ihss":
            if p("accepts_offer")>=YES: say("ihss_yes"); st["step"]="done"
            elif p("accepts_offer")<=NO: say("ihss_no"); st["step"]="done"
            else: st["unsure"]+=1; say("offscript")
        if st["unsure"]>=3: say("handoff"); st["handoff"]=True; break
    return st
LETTER="STATE OF CALIFORNIA - DEPARTMENT OF HEALTH CARE SERVICES. MEDI-CAL ANNUAL RENEWAL. Beneficiary: ROSA MARTINEZ. It is time to renew your Medi-Cal. Complete and return this form by 11/15/2026 or your benefits may end. Include proof of income and assets."
LETTER_ES="ESTADO DE CALIFORNIA. RENOVACIÓN ANUAL DE MEDI-CAL. Beneficiaria: ROSA MARTINEZ. Es hora de renovar su Medi-Cal. Complete y devuelva este formulario antes del 15/11/2026 o sus beneficios podrían terminar."
PERSONAS=[
 {"name":"Straightforward (EN)","expect":"sent","turns":[LETTER,"here's her bank statement [photo attached]","yes","sure, check it"]},
 {"name":"Straightforward (ES)","expect":"sent","turns":[LETTER_ES,"aquí está el estado de cuenta [foto adjunta]","sí, mándalo","sí"]},
 {"name":"Needs time","expect":"not_sent","turns":[LETTER,"ugh I don't have it, she keeps that stuff at her place. I'll get it this weekend"]},
 {"name":"Asks first","expect":"sent","turns":[LETTER,"what does this thing even need","ok here [bank statement photo]","go ahead","no thanks"]},
 {"name":"Conditional yes","expect":"not_sent","turns":[LETTER,"statement attached","yes but change her address first, she moved"]},
 {"name":"Sarcastic","expect":"not_sent","turns":[LETTER,"bank statement attached","oh yeah sure, send it to the void like last time 🙄"]},
 {"name":"Side request mid-flow","expect":"sent","turns":[LETTER,"attached her statement. also my son is sick and won't be at school tomorrow","yes send it","yes"]},
 {"name":"Crisis mid-flow","expect":"crisis","turns":[LETTER,"she just fell and she's not answering me"]},
 {"name":"Off-script / confused","expect":"handoff","turns":["idk","what is this","lol"]},
 {"name":"Wants a person","expect":"handoff","turns":[LETTER,"can I just talk to a real person please"]},
]
if __name__=="__main__":
    reps=int(sys.argv[1]) if len(sys.argv)>1 else 1
    allat=[]; rows=[]
    for p in PERSONAS:
        outs=[]
        for r in range(reps):
            st=run(p); outs.append(st); allat+=st["lat"]
        st=outs[0]
        outcome="crisis" if any("911" in t for _,t in st["log"]) else ("handoff" if st["handoff"] else ("sent" if st["sent"] else "not_sent"))
        same=all([t for _,t in o["log"]]==[t for _,t in st["log"]] for o in outs)
        rows.append((p["name"],p["expect"],outcome,len(p["turns"]),sum(st["lat"])/len(st["lat"]),same))
        print(f"\n=== {p['name']}  (expected {p['expect']}, got {outcome})")
        for who,t in st["log"]: print(f"  {'👤' if who=='family' else '🦎'} {t[:150]}")
    print("\n\nSUMMARY")
    print(f"{'persona':26}{'expected':>10}{'got':>10}{'turns':>7}{'avg Jev s':>10}{'identical x'+str(reps):>14}")
    for n,e,g,t,l,s in rows: print(f"{n:26}{e:>10}{g:>10}{t:>7}{l:>10.2f}{str(s):>14}")
    allat.sort(); print(f"\nJev calls: {len(allat)}, median {allat[len(allat)//2]*1000:.0f} ms, p90 {allat[int(len(allat)*0.9)]*1000:.0f} ms")
    print("correct outcomes:",sum(1 for r in rows if r[1]==r[2]),"/",len(rows))

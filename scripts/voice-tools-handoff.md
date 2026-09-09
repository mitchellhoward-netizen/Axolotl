# Voice tools runTool + executeVoiceSteps — for Claude

## Q1: deps.remind / set_reminder in voice
NOT wired. Voice deps (voice/brain.ts:359-368) set profile, getCases, appendCase, proposeSteps, knowledge, memory:undefined, studentName — NO remind, NO llm, NO district. set_reminder (tools.ts:935-941) does deps.remind?.(...) -> undefined -> returns the literal 'Got it - I'll remind you: {what}.' (promises without scheduling). DROP set_reminder from VOICE_TOOL_NAMES.

## Q2: KnowledgeGraph.get local or networked
LOCAL. graph.ts:17 get(districtId) reads an in-memory module cache (no network; [] until researched). But makeKnowledgeDep (brain.ts:156-173) ALSO calls searchSchoolGraph -> Supabase (resource-graph.js loadFromDb/loadEdgesFromDb -> c.from('resource')). For cached-only get_knowledge, keep KnowledgeGraph.get + drop searchSchoolGraph + add the 400ms cap.

---
## src/agent/tools.ts — runTool() switch (line 516-947, verbatim)

```ts
export async function runTool(name: string, args: Record<string, unknown>, deps: ToolDeps): Promise<string> {
  console.log(`[tool] ${name} ${JSON.stringify(redactForLog(args)).slice(0, 300)}`);
  switch (name) {
    case 'get_school_info': {
      const query = String(args.query ?? '').trim();
      const input = deps.profile?.district ?? qualifiedProfileSchool(deps.profile);
      // The researched district profile is the authoritative source. Research it on
      // demand when we don't have it yet (else the parent gets an honest "not yet").
      const profile = await researchDistrictProfile(input, deps.llm);
      const fromProfile = answerSchoolInfo(profile, query);
      // Grounded school-info (principal/phone/address/bell schedule) lives in the
      // knowledge graph's GENERAL_NAVIGATION node, from real web research.
      const researched = (await deps.knowledge?.('GENERAL_NAVIGATION', query)) ?? '';
      const parts = [fromProfile, researched].filter(Boolean);
      if (!parts.length) {
        return `I don't have ${profile.name || 'this district'} researched yet. Let me look it up — or tell me the school and city/state.`;
      }
      return parts.map(String).join('\n');
    }
    case 'get_law':
      return LAW_FACTS[String(args.topic ?? '').toLowerCase()] ?? 'I don’t have grounded law for that topic — suggest the school office.';
    case 'diagnose_barrier': {
      const b = detectBarriers(String(args.description ?? ''), contextFromProfile(deps.district))[0];
      return b ? `category=${b.category}; title=${b.title}; law=${b.law}` : 'No clear barrier detected — assume general attendance.';
    }
    case 'get_remedy': {
      const b = barrierByCategory(String(args.category ?? ''), contextFromProfile(deps.district));
      return b ? `${b.title}\n${b.law}\nContact: ${b.contact}${b.email ? `\nEmail: ${b.email}` : ''}\n${b.reminder}` : 'Unknown category.';
    }
    case 'draft_outreach': {
      const b = barrierByCategory(String(args.category ?? ''), contextFromProfile(deps.district));
      if (!b) return 'Unknown category.';
      const child = String(args.child ?? deps.studentName ?? 'my child');
      return `${b.draft.replaceAll('{child}', child)}\n\nContact: ${b.contact}${b.email ? `\nEmail: ${b.email}` : ''}\nNotes: ${b.reminder}`;
    }
    case 'send_email': {
      const to = String(args.to ?? '');
      const subject = String(args.subject ?? '');
      const body = String(args.body ?? '');
      if (!to || !subject || !body) return 'send_email needs to, subject, body.';
      // Present the draft as readable text (NOT a giant compose URL — the Gmail
      // compose link only pre-fills on desktop web, not mobile) so the parent can
      // review it, then approve the agent to send it from their connected Gmail
      // (reliable + unambiguously from them). Still consent-gated.
      deps.proposeSteps([
        {
          id: 'email-' + Date.now().toString(36),
          caseId: 'email',
          intent: 'send_email',
          channel: 'email',
          counterparty: { role: 'OTHER', email: to },
          payload: { channel: 'email', subject, body },
          successCondition: { describe: 'Email sent', kind: 'reference_received' },
          requiresConsent: true,
          status: 'awaiting_consent',
        },
      ]);
      return `Here's the email I'll send — review it, then reply "send it" and I'll send it from your Gmail (you approve it first):\n\nTo: ${to}\nSubject: ${subject}\n\n${body}`;
    }
    case 'account_action': {
      const url = String(args.url ?? '').trim();
      const phase = String(args.phase ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      if (phase !== 'signup' && phase !== 'login' && phase !== 'verify') {
        return 'account_action needs phase: signup, login, or verify.';
      }
      const fields = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; value?: unknown }>)
            .map((f) => ({ label: String(f.label ?? '').trim(), value: String(f.value ?? '') }))
            .filter((f) => f.label)
        : [];
      const password = typeof args.password === 'string' ? args.password : undefined;
      if (password && password.length > 16) {
        return 'That password is too long — this portal caps passwords at 16 characters. Please give a shorter one.';
      }
      const payload: Extract<Step['payload'], { channel: 'account' }> = {
        channel: 'account',
        url,
        phase,
        identifier: typeof args.identifier === 'string' ? args.identifier : undefined,
        password,
        fields: fields.length ? fields : undefined,
        code: typeof args.code === 'string' ? args.code : undefined,
      };
      deps.proposeSteps([
        {
          id: 'account-' + Date.now().toString(36),
          caseId: 'account',
          intent: 'account_' + phase,
          channel: 'account',
          counterparty: { role: 'OTHER' },
          payload,
          successCondition: { describe: 'Account ' + phase, kind: 'manual' },
          requiresConsent: phase !== 'verify',
          status: 'awaiting_consent',
        },
      ]);
      return phase === 'verify'
        ? 'Finishing the login with that code — will confirm once signed in.'
        : `Ready to ${phase === 'signup' ? 'create the account' : 'log in'}. Ask the parent to reply YES to proceed (or NO to change it).`;
    }
    case 'submit_form': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide the form url.';
      deps.proposeSteps([
        {
          id: 'submit-' + Date.now().toString(36),
          caseId: 'form',
          intent: 'submit_form',
          channel: 'submit',
          counterparty: { role: 'OTHER' },
          payload: { channel: 'submit', url },
          successCondition: { describe: 'Form submitted', kind: 'reference_received' },
          requiresConsent: true,
          status: 'awaiting_consent',
        },
      ]);
      return 'Ready to submit the form. Ask the parent to reply YES to submit (or NO to change it).';
    }
    case 'get_form_recipe': {
      const url = String(args.url ?? '').trim();
      if (!url) return 'Provide a form url.';
      const r = await getFormRecipe(url);
      if (!r) return 'No saved recipe for that form yet.';
      const parts: string[] = [];
      if (r.fills.length) parts.push(`Fields: ${r.fills.map((f) => f.label).join(', ')}`);
      if (r.controls.length) parts.push(`Controls: ${r.controls.map((c) => `${c.label} (${c.kind})`).join(', ')}`);
      if (r.selects.length) parts.push(`Selects: ${r.selects.map((s) => `${s.name} → ${s.option}`).join(', ')}`);
      return `Recipe for ${r.url}:\n${parts.join('\n')}${r.notes ? `\nNotes: ${r.notes}` : ''}`;
    }
    case 'save_form_recipe': {
      const url = String(args.url ?? '').trim();
      if (!url) return 'Provide a form url.';
      const fills = Array.isArray(args.fills)
        ? (args.fills as Array<{ label?: unknown }>).map((f) => ({ label: String(f.label ?? '').trim() })).filter((f) => f.label)
        : [];
      const controls = Array.isArray(args.controls)
        ? (args.controls as Array<{ label?: unknown; kind?: unknown }>)
            .map((c) => ({ label: String(c.label ?? '').trim(), kind: (String(c.kind ?? '').toLowerCase() === 'checkbox' ? 'checkbox' : 'radio') as 'radio' | 'checkbox' }))
            .filter((c) => c.label)
        : [];
      const selects = Array.isArray(args.selects)
        ? (args.selects as Array<{ name?: unknown; option?: unknown }>)
            .map((s) => ({ name: String(s.name ?? '').trim(), option: String(s.option ?? '').trim() }))
            .filter((s) => s.name)
        : [];
      const recipe: FormRecipe = {
        url,
        title: typeof args.title === 'string' ? args.title : undefined,
        fills,
        controls,
        selects,
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      };
      await saveFormRecipe(recipe);
      return `Saved recipe for ${url} (${fills.length} fields, ${controls.length} controls, ${selects.length} selects). ${fills.length || controls.length || selects.length ? 'Next time I\u2019ll fill this form in one shot.' : ''}`;
    }
    case 'call_school': {
      deps.proposeSteps([callStep(deps)]);
      return 'Ready to call the school. Ask the parent to reply YES to place the call (or NO to skip it).';
    }
    case 'web_search': {
      const q = String(args.query ?? '').trim();
      if (!q) return 'Provide a query.';
      const res = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
      const txt = res.ok ? await res.text() : '';
      return truncate(txt || 'No results found.', 5000);
    }
    case 'web_fetch': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`);
      const txt = res.ok ? await res.text() : '';
      return truncate(txt || 'Could not fetch that page.', 4000);
    }
    case 'browser_open': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await browserOpen(url);
      return r.ok
        ? `Opened ${r.data}. Use browser_observe to see what is actionable on the page.`
        : `browser unavailable (${r.reason}). Fall back to web_fetch.`;
    }
    case 'browser_observe': {
      const r = await browserObserve(String(args.instruction ?? '').trim() || undefined);
      return r.ok ? JSON.stringify(r.data) : `browser unavailable (${r.reason}).`;
    }
    case 'browser_act': {
      const instruction = String(args.instruction ?? '').trim();
      if (!instruction) return 'Provide an instruction.';
      // Submitting a form must go through the gated `submit_form` step — browser_act is the ungated
      // arbitrary-action primitive and is the one consent-bypass path. Block submit-like actions here
      // (the internal gated browserSubmit still works via the executor, so this only stops the LLM
      // tool from directly clicking submit).
      if (/\b(submit|submits|submitting|send (this|the) form|complete (the|this) (form|application|enrollment)|finali[sz]e|submit button|hit submit)\b/i.test(instruction)) {
        return 'Use submit_form (the system gates it behind the parent\u2019s explicit YES) to submit — not browser_act.';
      }
      const r = await browserAct(instruction);
      return r.ok ? `Action done: ${r.data}` : `browser unavailable (${r.reason}).`;
    }
    case 'browser_extract': {
      const instruction = String(args.instruction ?? '').trim();
      const fields = Array.isArray(args.fields) ? (args.fields as unknown[]).map(String) : [];
      if (!instruction || !fields.length) return 'Provide an instruction and a fields array.';
      const r = await browserExtract(instruction, fields);
      return r.ok ? JSON.stringify(r.data) : `browser unavailable (${r.reason}).`;
    }
    case 'browser_vision': {
      const instruction = String(args.instruction ?? '').trim();
      if (!instruction) return 'Provide an instruction for the vision model.';
      const r = await browserVision(instruction);
      return r.ok ? r.data : `vision unavailable (${r.reason}).`;
    }
    case 'browser_fill': {
      const fields = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const norm = fields
        .map((f) => ({ label: String(f.label ?? '').trim(), value: String(f.value ?? '') }))
        .filter((f) => f.label);
      if (!norm.length) return 'Provide fields: [{label, value}]';
      const r = await browserFill(norm);
      if (!r.ok) return `browser unavailable (${r.reason}).`;
      const verif = r.data.verified === false
        ? ' (not machine-verified)'
        : r.data.mismatches?.length
          ? ` — ${r.data.mismatches.length} field(s) couldn\u2019t be filled: ${r.data.mismatches.map((m) => m.label).join(', ')}`
          : '';
      return `Pre-filled ${r.data.filled} field(s)${verif} on ${r.data.url ?? 'the form'}. NOT submitted — submission needs the parent\u2019s explicit YES.`;
    }
    case 'extract_pdf': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await extractPdf(url);
      return r.ok ? truncate(r.data.text, 4000) : `PDF extraction failed: ${r.reason}`;
    }
    case 'pdf_fields': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const r = await listPdfFields(url);
      if (!r.ok || !r.data) return `PDF unavailable (${r.reason}).`;
      const fields = r.data.fields;
      if (!fields.length) return 'That PDF has no fillable form fields (flat or scanned PDF).';
      return (
        `${fields.length} field(s):\n` +
        fields
          .map(
            (f) =>
              `- ${f.label && f.label !== f.name ? `${f.label} → ` : ''}${f.name} (${f.type})${
                f.value ? ` = "${f.value}"` : ''
              }${f.options?.length ? ` [${f.options.join(' | ')}]` : ''}`,
          )
          .join('\n')
      );
    }
    case 'pdf_fill': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const raw = Array.isArray(args.fields)
        ? (args.fields as Array<{ label?: unknown; field?: unknown; value?: unknown }>)
        : [];
      const fields = raw
        .map((f) => ({
          label: f.label ? String(f.label).trim() : undefined,
          field: f.field ? String(f.field).trim() : undefined,
          value: String(f.value ?? ''),
        }))
        .filter((f) => f.label || f.field);
      if (!fields.length) return 'Provide fields: [{label?, field?, value}]';
      const r = await fillPdf(url, fields);
      if (!r.ok || !r.data) return `PDF fill failed (${r.reason}).`;
      const d = r.data;
      const parts = [`Filled ${d.filled}/${d.total} field(s) in a ${d.fieldCount}-field PDF.`];
      if (d.unmatched.length)
        parts.push(
          `Unmatched (no field name matched — use pdf_fields for exact names, then pass "field"): ${d.unmatched.join(', ')}.`,
        );
      if (d.failed.length)
        parts.push(`Failed: ${d.failed.map((x) => `${x.field} (${x.error})`).join(', ')}.`);
      if (d.filePath) parts.push(`Filled PDF saved to ${d.filePath}.`);
      parts.push(
        `NOT auto-submitted — share the filled PDF with the parent to review, then propose emailing/uploading it (needs the parent's YES).`,
      );
      return parts.join(' ');
    }
    case 'browser_assess': {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) return 'Provide a valid http(s) url.';
      const target = args.target ? String(args.target).trim() : undefined;
      const r = await browserAssessPage(url, target);
      if (!r.ok) return `browser unavailable (${r.reason}).`;
      const a = r.data;
      return `${a.ok ? 'VERIFIED' : 'POOR'} page (${a.url}): title="${a.title.slice(0, 60)}"; ${a.hasForm ? `${a.fieldCount} form field(s)` : 'NO form fields'}; ${a.blank ? 'BLANK page' : `${a.contentLength} chars`}; ${a.problem ? `problem: ${a.problem}` : 'matches target'}. If POOR, try the next search result.`;
    }
    case 'save_evidence': {
      const claim = String(args.claim ?? '').trim();
      const sourceUrl = String(args.source_url ?? '').trim();
      const sourceTitle = String(args.source_title ?? '').trim();
      if (!claim || !sourceUrl || !sourceTitle) return 'save_evidence needs claim, source_url, source_title.';
      const res = await createEvidence({
        claim,
        sourceUrl,
        sourceTitle,
        sourceType: typeof args.source_type === 'string' ? (args.source_type as SourceType) : undefined,
        evidenceSpan: typeof args.evidence_span === 'string' ? args.evidence_span : undefined,
        jurisdiction: typeof args.jurisdiction === 'string' ? (args.jurisdiction as EvidenceRecord['jurisdiction']) : undefined,
        official: typeof args.official === 'boolean' ? args.official : undefined,
        confidence: typeof args.confidence === 'number' ? args.confidence : undefined,
      });
      return `Saved evidence [${res.status}] "${claim}".${res.reasons.length ? ` Caveats: ${res.reasons.join('; ')}` : ' Verified.'}`;
    }
    case 'search_school_graph': {
      const query = String(args.query ?? '').trim();
      const districtId = String(args.district_id ?? '').trim() || districtKey(deps);
      let category = String(args.category ?? '').trim().toUpperCase();
      if (!category && query) category = inferCategory(query) ?? '';
      const chain = await searchSchoolGraph(districtId, category || undefined);
      return chain && chain.nodes.length ? chainSummary(chain) : 'No resource-graph chain found for that yet.';
    }
    case 'save_resource': {
      const type = String(args.type ?? '').trim();
      const title = String(args.title ?? '').trim();
      const url = String(args.canonical_url ?? '').trim();
      if (!type || !title || !url) return 'save_resource needs type, title, canonical_url.';
      const node: ResourceNode = {
        id: 'res-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        type: type as ResourceType,
        districtId: typeof args.district_id === 'string' ? args.district_id : undefined,
        category: typeof args.category === 'string' ? args.category.toUpperCase() : undefined,
        title,
        summary: String(args.summary ?? '').trim(),
        canonicalUrl: url,
        sources: [{ title, url }],
        status: (typeof args.status === 'string' ? args.status : 'draft') as ResourceNode['status'],
        confidence: typeof args.confidence === 'number' ? args.confidence : 0.6,
        discoveredAt: new Date().toISOString(),
      };
      await saveResource(node);
      return `Saved ${type} "${title}" to the resource graph.`;
    }
    case 'save_procedure': {
      const name = String(args.name ?? '').trim();
      const intent = String(args.intent ?? '').trim();
      const jurisdiction = String(args.jurisdiction ?? '').trim() || districtKey(deps);
      if (!name || !intent) return 'save_procedure needs name and intent.';
      const steps = Array.isArray(args.steps)
        ? (args.steps as Array<{ tool?: unknown; args?: unknown; note?: unknown }>)
        : [];
      const normSteps = steps.map((s, i) => ({
        order: i + 1,
        tool: String(s.tool ?? ''),
        args:
          typeof s.args === 'object' && s.args
            ? Object.fromEntries(Object.entries(s.args as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
            : {},
        note: typeof s.note === 'string' ? s.note : undefined,
      }));
      const now = new Date().toISOString();
      const skill: Skill = {
        id: 'skill-' + makeSkillKey(intent, jurisdiction),
        name,
        key: makeSkillKey(intent, jurisdiction),
        description: String(args.description ?? '').trim(),
        whenToUse: String(args.when_to_use ?? '').trim(),
        steps: normSteps,
        evidenceDeps: Array.isArray(args.evidence_deps) ? (args.evidence_deps as string[]).map(String) : [],
        status: 'active',
        approved: Boolean(args.approved),
        version: 1,
        createdAt: now,
        updatedAt: now,
        lastVerifiedAt: now,
      };
      await saveSkill(skill);
      return `Saved procedure "${name}" [${skill.key}] with ${normSteps.length} step(s).${skill.approved ? '' : ' Pending parent approval before reuse.'}`;
    }
    case 'list_skills': {
      const skills = await listSkills();
      return skills.length ? skills.map(skillSummary).join('\n\n') : 'No saved procedures yet.';
    }
    case 'list_open_cases':
      return openCaseSummary(deps.getCases());
    case 'get_knowledge':
      return (
        (await deps.knowledge?.(String(args.category ?? ''), String(args.query ?? ''))) ??
        'No researched knowledge for that yet.'
      );
    case 'record_getting':
      return (await deps.memory?.addGetting(String(args.item ?? '').trim())) ?? 'Recorded.';
    case 'start_initiative':
      return (await deps.memory?.startInitiative(String(args.label ?? '').trim())) ?? 'Started.';
    case 'save_profile': {
      const c = Array.isArray(args.children) ? (args.children as Array<{ name?: string; grade?: string }>) : [];
      deps.saveProfile?.({
        children: c.map((x) => ({ name: String(x.name ?? ''), grade: x.grade ? String(x.grade) : undefined })),
        school: typeof args.school === 'string' ? args.school : undefined,
        location: typeof args.location === 'string' ? args.location : undefined,
        needs: Array.isArray(args.needs) ? (args.needs as string[]).map(String) : [],
        challenges: Array.isArray(args.challenges) ? (args.challenges as string[]).map(String) : [],
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      });
      return 'Saved.';
    }
    case 'log_case': {
      deps.appendCase({
        kind: String(args.kind ?? 'general'),
        summary: String(args.summary ?? ''),
        child: String(args.child ?? ''),
        contact: String(args.contact ?? ''),
        reminder: String(args.reminder ?? ''),
        status: 'open',
      });
      return 'Logged.';
    }
    case 'recall_history': {
      const query = String(args.query ?? '').trim();
      if (!query) return 'Provide a query to search the conversation for.';
      return (await deps.recall?.(query)) ?? 'Nothing found in the conversation.';
    }
    case 'set_reminder': {
      const what = String(args.what ?? '').trim();
      const when = String(args.when ?? '').trim();
      if (!what) return 'set_reminder needs "what" to remind about.';
      if (!when) return 'set_reminder needs a "when" (e.g. "Friday", "tomorrow at 3pm", "in 2 hours").';
      return (await deps.remind?.(what, when)) ?? `Got it — I'll remind you: ${what}.`;
    }
    case 'now':
      return new Date().toISOString();
    default:
      return 'Unknown tool.';
  }
}
```

---
## src/agent/agent.ts — executeVoiceSteps (line 562-566, verbatim)

```ts
  async executeVoiceSteps(conversationId: string, steps: Step[]): Promise<string> {
    const results = await this.runSteps(steps, this.resolveMode(), undefined, conversationId);
    return results.map((r) => r.parentSummary).join('\n') || 'Done.';
  }

```

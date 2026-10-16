import type { PathwayHints, PathwayRegistry } from './registry.js';
import { pvusdUba } from './ca-pvusd-uba.js';
import { psusdLinq } from './ca-psusd-linq.js';

/**
 * The launch pathways and how the engine should run them. Lanes are registered by whoever runs
 * them (production, or the harness against a replica), because a lane is bound to a place.
 */

const ON_PROGRAM = (v: unknown) => Array.isArray(v) && v.some((b) => ['snap', 'tanf', 'medicaid'].includes(String(b)));

/** Ask about CalFresh / CalWORKs / Medi-Cal first: a yes usually means nothing to file. */
export const MEALS_FORM_HINTS: PathwayHints = {
  precheckFacts: ['member.<m>.benefits'],
  shortCircuit: { 'member.<m>.benefits': { when: ON_PROGRAM, prior: 0.35 } },
  why: {
    'member.<m>.benefits': {
      en: 'If someone gets CalFresh, CalWORKs or Medi-Cal, your child is probably already covered and we may not need this form.',
      es: 'Si alguien recibe CalFresh, CalWORKs o Medi-Cal, es probable que su hijo ya esté cubierto y quizá no necesitemos este formulario.',
    },
  },
  cues: { 'member.<m>.benefits': /calfresh|cal fresh|cupones|estampillas|ebt|calworks|medi-?cal|snap/i },
  trigger: /\b(lunch|meal|income) (form|application|paper)|universal benefits|sun bucks|formulario de (ingresos|comida|almuerzo)|solicitud de comida/i,
};

export function registerLaunchPathways(registry: PathwayRegistry): PathwayRegistry {
  return registry.registerPathway(pvusdUba, MEALS_FORM_HINTS).registerPathway(psusdLinq, MEALS_FORM_HINTS);
}

export { pvusdUba, psusdLinq };

import type { Department, DocumentType } from '@/lib/domain/types'

export const GENERATOR_LANGUAGES = ['en', 'it', 'es', 'fr'] as const
export type GeneratorLanguage = (typeof GENERATOR_LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<GeneratorLanguage, string> = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
}

export interface TemplateVars {
  topic: string
  company: string
  person: string
  dept: string
  amount: string
  days: number
  findings: number
  years: number
}

export interface LocalePack {
  locale: string
  departments: Record<Department, string>
  documentTypes: Record<DocumentType, string>
  topics: Record<Department, string[]>
  sections: string[]
  header: (v: { ref: string; revision: number; owner: string; dept: string }) => string
  disclaimer: string
  revisionNote: (revision: number) => string
  description: (v: { type: string; company: string; owner: string }) => string
  paragraphs: ((v: TemplateVars) => string)[]
}

const en: LocalePack = {
  locale: 'en-US',
  departments: { HR: 'HR', Legal: 'Legal', Finance: 'Finance', Procurement: 'Procurement', IT: 'IT', Operations: 'Operations', Compliance: 'Compliance', Sales: 'Sales' },
  documentTypes: {
    Contract: 'Contract',
    Invoice: 'Invoice',
    Policy: 'Policy',
    Procedure: 'Procedure',
    Report: 'Report',
    Proposal: 'Proposal',
    'Meeting Minutes': 'Meeting Minutes',
    'Technical Specification': 'Technical Specification',
    'Onboarding Record': 'Onboarding Record',
    'Vendor Agreement': 'Vendor Agreement',
  },
  topics: {
    HR: ['remote work eligibility', 'parental leave', 'performance review cadence', 'employee onboarding', 'workplace conduct'],
    Legal: ['data processing addendum', 'intellectual property assignment', 'limitation of liability', 'non-disclosure obligations', 'dispute resolution'],
    Finance: ['quarterly revenue recognition', 'expense reimbursement', 'accounts payable aging', 'capital expenditure approval', 'budget variance'],
    Procurement: ['supplier qualification', 'purchase order thresholds', 'competitive bidding', 'vendor risk assessment', 'contract renewal'],
    IT: ['identity and access management', 'backup and disaster recovery', 'endpoint encryption', 'incident response', 'cloud cost optimization'],
    Operations: ['warehouse throughput', 'service level objectives', 'fleet maintenance', 'capacity planning', 'quality inspection'],
    Compliance: ['records retention schedule', 'anti-bribery controls', 'GDPR subject access requests', 'SOC 2 evidence collection', 'whistleblower reporting'],
    Sales: ['enterprise pricing tiers', 'territory planning', 'renewal forecasting', 'partner referral program', 'discount approval matrix'],
  },
  sections: ['Purpose', 'Scope', 'Definitions', 'Responsibilities', 'Terms', 'Controls', 'Review'],
  header: ({ ref, revision, owner, dept }) => `Reference: ${ref}  |  Revision: ${revision}  |  Owner: ${owner}  |  Department: ${dept}`,
  disclaimer: 'FICTIONAL DOCUMENT GENERATED FOR DEMONSTRATION PURPOSES. NOT A REAL AGREEMENT OR RECORD.',
  revisionNote: (r) => `Revision ${r} notes: clarified thresholds and updated accountable owner.`,
  description: ({ type, company, owner }) => `Fictional ${type.toLowerCase()} for ${company}, owned by ${owner}.`,
  paragraphs: [
    (v) => `This section governs ${v.topic} for ${v.company}. ${v.person} is accountable for maintaining the controls described herein and must review them at least every ${v.days} days.`,
    (v) => `Any commitment related to ${v.topic} exceeding USD ${v.amount} requires written approval from the ${v.dept} department lead prior to execution.`,
    (v) => `Exceptions concerning ${v.topic} must be documented, include a business justification, and be retained in accordance with the corporate records retention schedule.`,
    (v) => `${v.person} confirmed that the ${v.topic} process was tested during the period, with ${v.findings} findings logged and remediation due within ${v.days} days.`,
    (v) => `The parties agree that obligations relating to ${v.topic} survive termination for a period of ${v.years} years.`,
  ],
}

const it: LocalePack = {
  locale: 'it-IT',
  departments: { HR: 'Risorse Umane', Legal: 'Ufficio Legale', Finance: 'Finanza', Procurement: 'Acquisti', IT: 'IT', Operations: 'Operazioni', Compliance: 'Compliance', Sales: 'Vendite' },
  documentTypes: {
    Contract: 'Contratto',
    Invoice: 'Fattura',
    Policy: 'Policy',
    Procedure: 'Procedura',
    Report: 'Rapporto',
    Proposal: 'Proposta',
    'Meeting Minutes': 'Verbale di riunione',
    'Technical Specification': 'Specifica tecnica',
    'Onboarding Record': 'Scheda di onboarding',
    'Vendor Agreement': 'Accordo con fornitore',
  },
  topics: {
    HR: ['idoneità al lavoro da remoto', 'congedo parentale', 'cadenza delle valutazioni delle prestazioni', 'inserimento dei dipendenti', 'condotta sul luogo di lavoro'],
    Legal: ['accordo sul trattamento dei dati', 'cessione della proprietà intellettuale', 'limitazione di responsabilità', 'obblighi di riservatezza', 'risoluzione delle controversie'],
    Finance: ['riconoscimento trimestrale dei ricavi', 'rimborso spese', 'anzianità dei debiti verso fornitori', 'approvazione degli investimenti', 'scostamento di budget'],
    Procurement: ['qualifica dei fornitori', 'soglie degli ordini di acquisto', 'gare competitive', 'valutazione del rischio fornitori', 'rinnovo dei contratti'],
    IT: ['gestione di identità e accessi', 'backup e disaster recovery', 'crittografia degli endpoint', 'risposta agli incidenti', 'ottimizzazione dei costi cloud'],
    Operations: ['produttività del magazzino', 'obiettivi di livello di servizio', 'manutenzione della flotta', 'pianificazione della capacità', 'ispezione qualità'],
    Compliance: ['piano di conservazione documentale', 'controlli anticorruzione', 'richieste di accesso GDPR', 'raccolta evidenze SOC 2', 'segnalazioni whistleblowing'],
    Sales: ['fasce di prezzo enterprise', 'pianificazione territoriale', 'previsione dei rinnovi', 'programma di referral partner', 'matrice di approvazione sconti'],
  },
  sections: ['Scopo', 'Ambito', 'Definizioni', 'Responsabilità', 'Condizioni', 'Controlli', 'Revisione'],
  header: ({ ref, revision, owner, dept }) => `Riferimento: ${ref}  |  Revisione: ${revision}  |  Responsabile: ${owner}  |  Reparto: ${dept}`,
  disclaimer: 'DOCUMENTO FITTIZIO GENERATO A SCOPO DIMOSTRATIVO. NON È UN ACCORDO O UN DOCUMENTO REALE.',
  revisionNote: (r) => `Note alla revisione ${r}: soglie chiarite e responsabile aggiornato.`,
  description: ({ type, company, owner }) => `${type} fittizio per ${company}, di responsabilità di ${owner}.`,
  paragraphs: [
    (v) => `La presente sezione disciplina ${v.topic} per ${v.company}. ${v.person} è responsabile del mantenimento dei controlli qui descritti e deve riesaminarli almeno ogni ${v.days} giorni.`,
    (v) => `Qualsiasi impegno relativo a ${v.topic} superiore a ${v.amount} USD richiede l'approvazione scritta del responsabile del reparto ${v.dept} prima dell'esecuzione.`,
    (v) => `Le eccezioni riguardanti ${v.topic} devono essere documentate, includere una motivazione aziendale ed essere conservate secondo il piano aziendale di conservazione documentale.`,
    (v) => `${v.person} ha confermato che il processo di ${v.topic} è stato verificato nel periodo, con ${v.findings} rilievi registrati e azioni correttive previste entro ${v.days} giorni.`,
    (v) => `Le parti convengono che gli obblighi relativi a ${v.topic} sopravvivono alla cessazione per un periodo di ${v.years} anni.`,
  ],
}

const es: LocalePack = {
  locale: 'es-ES',
  departments: { HR: 'Recursos Humanos', Legal: 'Legal', Finance: 'Finanzas', Procurement: 'Compras', IT: 'TI', Operations: 'Operaciones', Compliance: 'Cumplimiento', Sales: 'Ventas' },
  documentTypes: {
    Contract: 'Contrato',
    Invoice: 'Factura',
    Policy: 'Política',
    Procedure: 'Procedimiento',
    Report: 'Informe',
    Proposal: 'Propuesta',
    'Meeting Minutes': 'Acta de reunión',
    'Technical Specification': 'Especificación técnica',
    'Onboarding Record': 'Registro de incorporación',
    'Vendor Agreement': 'Acuerdo con proveedor',
  },
  topics: {
    HR: ['elegibilidad para teletrabajo', 'permiso parental', 'frecuencia de evaluaciones de desempeño', 'incorporación de empleados', 'conducta en el lugar de trabajo'],
    Legal: ['anexo de tratamiento de datos', 'cesión de propiedad intelectual', 'limitación de responsabilidad', 'obligaciones de confidencialidad', 'resolución de disputas'],
    Finance: ['reconocimiento trimestral de ingresos', 'reembolso de gastos', 'antigüedad de cuentas por pagar', 'aprobación de inversiones de capital', 'desviación presupuestaria'],
    Procurement: ['homologación de proveedores', 'umbrales de órdenes de compra', 'licitación competitiva', 'evaluación de riesgo de proveedores', 'renovación de contratos'],
    IT: ['gestión de identidades y accesos', 'copias de seguridad y recuperación ante desastres', 'cifrado de equipos', 'respuesta a incidentes', 'optimización de costes en la nube'],
    Operations: ['rendimiento del almacén', 'objetivos de nivel de servicio', 'mantenimiento de la flota', 'planificación de capacidad', 'inspección de calidad'],
    Compliance: ['calendario de conservación de registros', 'controles anticorrupción', 'solicitudes de acceso RGPD', 'recopilación de evidencias SOC 2', 'canal de denuncias'],
    Sales: ['niveles de precios empresariales', 'planificación territorial', 'previsión de renovaciones', 'programa de referidos de socios', 'matriz de aprobación de descuentos'],
  },
  sections: ['Objeto', 'Alcance', 'Definiciones', 'Responsabilidades', 'Condiciones', 'Controles', 'Revisión'],
  header: ({ ref, revision, owner, dept }) => `Referencia: ${ref}  |  Revisión: ${revision}  |  Responsable: ${owner}  |  Departamento: ${dept}`,
  disclaimer: 'DOCUMENTO FICTICIO GENERADO CON FINES DE DEMOSTRACIÓN. NO ES UN ACUERDO NI UN REGISTRO REAL.',
  revisionNote: (r) => `Notas de la revisión ${r}: se aclararon los umbrales y se actualizó el responsable.`,
  description: ({ type, company, owner }) => `${type} ficticio para ${company}, a cargo de ${owner}.`,
  paragraphs: [
    (v) => `Esta sección regula ${v.topic} para ${v.company}. ${v.person} es responsable de mantener los controles aquí descritos y debe revisarlos al menos cada ${v.days} días.`,
    (v) => `Todo compromiso relacionado con ${v.topic} que supere ${v.amount} USD requiere la aprobación por escrito del responsable del departamento de ${v.dept} antes de su ejecución.`,
    (v) => `Las excepciones relativas a ${v.topic} deben documentarse, incluir una justificación de negocio y conservarse conforme al calendario corporativo de conservación de registros.`,
    (v) => `${v.person} confirmó que el proceso de ${v.topic} se probó durante el período, con ${v.findings} hallazgos registrados y corrección prevista en un plazo de ${v.days} días.`,
    (v) => `Las partes acuerdan que las obligaciones relativas a ${v.topic} subsisten tras la terminación durante un período de ${v.years} años.`,
  ],
}

const fr: LocalePack = {
  locale: 'fr-FR',
  departments: { HR: 'Ressources Humaines', Legal: 'Juridique', Finance: 'Finance', Procurement: 'Achats', IT: 'Informatique', Operations: 'Opérations', Compliance: 'Conformité', Sales: 'Ventes' },
  documentTypes: {
    Contract: 'Contrat',
    Invoice: 'Facture',
    Policy: 'Politique',
    Procedure: 'Procédure',
    Report: 'Rapport',
    Proposal: 'Proposition',
    'Meeting Minutes': 'Compte rendu de réunion',
    'Technical Specification': 'Spécification technique',
    'Onboarding Record': "Dossier d'intégration",
    'Vendor Agreement': 'Accord fournisseur',
  },
  topics: {
    HR: ['éligibilité au télétravail', 'congé parental', 'fréquence des entretiens annuels', 'intégration des collaborateurs', 'conduite au travail'],
    Legal: ['avenant relatif au traitement des données', 'cession de propriété intellectuelle', 'limitation de responsabilité', 'obligations de confidentialité', 'règlement des litiges'],
    Finance: ['reconnaissance trimestrielle du chiffre d’affaires', 'remboursement des frais', 'balance âgée fournisseurs', 'approbation des investissements', 'écart budgétaire'],
    Procurement: ['qualification des fournisseurs', 'seuils des bons de commande', 'appels d’offres', 'évaluation des risques fournisseurs', 'renouvellement des contrats'],
    IT: ['gestion des identités et des accès', 'sauvegarde et reprise après sinistre', 'chiffrement des postes', 'réponse aux incidents', 'optimisation des coûts cloud'],
    Operations: ['débit de l’entrepôt', 'objectifs de niveau de service', 'maintenance de la flotte', 'planification des capacités', 'contrôle qualité'],
    Compliance: ['calendrier de conservation des archives', 'contrôles anticorruption', 'demandes d’accès RGPD', 'collecte de preuves SOC 2', 'dispositif d’alerte'],
    Sales: ['grilles tarifaires entreprise', 'planification des territoires', 'prévision des renouvellements', 'programme de parrainage partenaires', 'matrice d’approbation des remises'],
  },
  sections: ['Objet', 'Périmètre', 'Définitions', 'Responsabilités', 'Conditions', 'Contrôles', 'Revue'],
  header: ({ ref, revision, owner, dept }) => `Référence : ${ref}  |  Révision : ${revision}  |  Responsable : ${owner}  |  Service : ${dept}`,
  disclaimer: 'DOCUMENT FICTIF GÉNÉRÉ À DES FINS DE DÉMONSTRATION. IL NE S’AGIT PAS D’UN ACCORD OU D’UN DOCUMENT RÉEL.',
  revisionNote: (r) => `Notes de la révision ${r} : seuils clarifiés et responsable mis à jour.`,
  description: ({ type, company, owner }) => `${type} fictif pour ${company}, sous la responsabilité de ${owner}.`,
  paragraphs: [
    (v) => `La présente section encadre ${v.topic} pour ${v.company}. ${v.person} est responsable du maintien des contrôles décrits ci-après et doit les revoir au moins tous les ${v.days} jours.`,
    (v) => `Tout engagement relatif à ${v.topic} dépassant ${v.amount} USD requiert l’approbation écrite du responsable du service ${v.dept} avant exécution.`,
    (v) => `Les exceptions concernant ${v.topic} doivent être documentées, comporter une justification métier et être conservées conformément au calendrier de conservation des archives de l’entreprise.`,
    (v) => `${v.person} a confirmé que le processus de ${v.topic} a été testé au cours de la période, avec ${v.findings} constats enregistrés et une remédiation prévue sous ${v.days} jours.`,
    (v) => `Les parties conviennent que les obligations relatives à ${v.topic} survivent à la résiliation pendant une durée de ${v.years} ans.`,
  ],
}

export const LOCALE_PACKS: Record<GeneratorLanguage, LocalePack> = { en, it, es, fr }

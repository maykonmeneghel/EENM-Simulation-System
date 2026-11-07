/**
 * Bibliography of the equations view. Every DOI was checked against Crossref (title, authors, year, journal) on
 * 2026-11-05 (the wrist sources, from Saul 2015 on, on 2026-11-07); Doucet 2012 has no DOI and was checked on PubMed. Links: Google Scholar searches the exact title.
 */
export interface Reference {
  id: ReferenceId;
  authors: string;
  year: number;
  title: string;
  venue: string;
  doi?: string;
  pmid?: string;
}

export type ReferenceId =
  | 'booth1997'
  | 'cisiKohn2008'
  | 'mogyoros1996'
  | 'gregoryBickel2005'
  | 'doucet2012'
  | 'hald2012'
  | 'fuglevand1993'
  | 'raikova2013'
  | 'sale1982'
  | 'zoughaib2026'
  | 'macefield1996'
  | 'potvinFuglevand2017'
  | 'changShields2011'
  | 'gallego2015'
  | 'dideriksen2017'
  | 'agapaki2018'
  | 'formento2018'
  | 'watanabe2013'
  | 'saul2015'
  | 'binderMarkey2023'
  | 'delp1996'
  | 'thelen2003'
  | 'davidsonCharles2017';

export const REFERENCES: Record<ReferenceId, Reference> = {
  booth1997: {
    id: 'booth1997',
    authors: 'Booth V, Rinzel J, Kiehn O',
    year: 1997,
    title: 'Compartmental model of vertebrate motoneurons for Ca2+-dependent spiking and plateau potentials under pharmacological treatment',
    venue: 'J Neurophysiol 78:3371–3385',
    doi: '10.1152/jn.1997.78.6.3371',
  },
  cisiKohn2008: {
    id: 'cisiKohn2008',
    authors: 'Cisi RRL, Kohn AF',
    year: 2008,
    title: 'Simulation system of spinal cord motor nuclei and associated nerves and muscles, in a Web-based architecture',
    venue: 'J Comput Neurosci 25:520–542',
    doi: '10.1007/s10827-008-0092-8',
  },
  mogyoros1996: {
    id: 'mogyoros1996',
    authors: 'Mogyoros I, Kiernan MC, Burke D',
    year: 1996,
    title: 'Strength-duration properties of human peripheral nerve',
    venue: 'Brain 119:439–447',
    doi: '10.1093/brain/119.2.439',
  },
  gregoryBickel2005: {
    id: 'gregoryBickel2005',
    authors: 'Gregory CM, Bickel CS',
    year: 2005,
    title: 'Recruitment patterns in human skeletal muscle during electrical stimulation',
    venue: 'Phys Ther 85:358–364',
    doi: '10.1093/ptj/85.4.358',
  },
  doucet2012: {
    id: 'doucet2012',
    authors: 'Doucet BM, Lam A, Griffin L',
    year: 2012,
    title: 'Neuromuscular electrical stimulation for skeletal muscle function',
    venue: 'Yale J Biol Med 85:201–215',
    pmid: '22737049',
  },
  hald2012: {
    id: 'hald2012',
    authors: 'Hald BO, Jensen LJ, Sørensen PG, Holstein-Rathlou NH, Brings Jacobsen JC',
    year: 2012,
    title: 'Applicability of cable theory to vascular conducted responses',
    venue: 'Biophys J 102:1352–1362',
    doi: '10.1016/j.bpj.2012.01.055',
  },
  fuglevand1993: {
    id: 'fuglevand1993',
    authors: 'Fuglevand AJ, Winter DA, Patla AE',
    year: 1993,
    title: 'Models of recruitment and rate coding organization in motor-unit pools',
    venue: 'J Neurophysiol 70:2470–2488',
    doi: '10.1152/jn.1993.70.6.2470',
  },
  raikova2013: {
    id: 'raikova2013',
    authors: 'Raikova R, Aladjov H, Celichowski J, Krutki P',
    year: 2013,
    title: 'An approach for simulation of the muscle force modeling it by summation of motor unit contraction forces',
    venue: 'Comput Math Methods Med 2013:625427',
    doi: '10.1155/2013/625427',
  },
  sale1982: {
    id: 'sale1982',
    authors: 'Sale D, Quinlan J, Marsh E, McComas AJ, Belanger AY',
    year: 1982,
    title: 'Influence of joint position on ankle plantarflexion in humans',
    venue: 'J Appl Physiol 52:1636–1642',
    doi: '10.1152/jappl.1982.52.6.1636',
  },
  zoughaib2026: {
    id: 'zoughaib2026',
    authors: 'Zoughaib WS et al.',
    year: 2026,
    title: 'Opposing effects of dietary nitrate on muscle contractile function in fast and slow human muscles',
    venue: 'Med Sci Sports Exerc 58:1012–1020',
    doi: '10.1249/MSS.0000000000003932',
  },
  macefield1996: {
    id: 'macefield1996',
    authors: 'Macefield VG, Fuglevand AJ, Bigland-Ritchie B',
    year: 1996,
    title: 'Contractile properties of single motor units in human toe extensors assessed by intraneural motor axon stimulation',
    venue: 'J Neurophysiol 75:2509–2519',
    doi: '10.1152/jn.1996.75.6.2509',
  },
  potvinFuglevand2017: {
    id: 'potvinFuglevand2017',
    authors: 'Potvin JR, Fuglevand AJ',
    year: 2017,
    title: 'A motor unit-based model of muscle fatigue',
    venue: 'PLoS Comput Biol 13:e1005581',
    doi: '10.1371/journal.pcbi.1005581',
  },
  changShields2011: {
    id: 'changShields2011',
    authors: 'Chang YJ, Shields RK',
    year: 2011,
    title: 'Doublet electrical stimulation enhances torque production in people with spinal cord injury',
    venue: 'Neurorehabil Neural Repair 25:423–432',
    doi: '10.1177/1545968310390224',
  },
  gallego2015: {
    id: 'gallego2015',
    authors: 'Gallego JA, Dideriksen JL, Holobar A, et al.',
    year: 2015,
    title:
      'The Phase Difference Between Neural Drives to Antagonist Muscles in Essential Tremor Is Associated with the Relative Strength of Supraspinal and Afferent Input',
    venue: 'J Neurosci 35:8925–8937',
    doi: '10.1523/JNEUROSCI.0106-15.2015',
  },
  dideriksen2017: {
    id: 'dideriksen2017',
    authors: 'Dideriksen JL, Laine CM, Dosen S, et al.',
    year: 2017,
    title: 'Electrical Stimulation of Afferent Pathways for the Suppression of Pathological Tremor',
    venue: 'Front Neurosci 11:178',
    doi: '10.3389/fnins.2017.00178',
  },
  agapaki2018: {
    id: 'agapaki2018',
    authors: 'Agapaki OM, Christakos CN, Anastasopoulos D',
    year: 2018,
    title:
      'Characteristics of Rest and Postural Tremors in Parkinson’s Disease: An Analysis of Motor Unit Firing Synchrony and Patterns',
    venue: 'Front Hum Neurosci 12:179',
    doi: '10.3389/fnhum.2018.00179',
  },
  formento2018: {
    id: 'formento2018',
    authors: 'Formento E, Minassian K, Wagner F, et al.',
    year: 2018,
    title:
      'Electrical spinal cord stimulation must preserve proprioception to enable locomotion in humans with spinal cord injury',
    venue: 'Nat Neurosci 21:1728–1741',
    doi: '10.1038/s41593-018-0262-6',
  },
  watanabe2013: {
    id: 'watanabe2013',
    authors: 'Watanabe RN, Magalhães FH, Elias LA, et al.',
    year: 2013,
    title:
      'Influences of premotoneuronal command statistics on the scaling of motor output variability during isometric plantar flexion',
    venue: 'J Neurophysiol 110:2592–2606',
    doi: '10.1152/jn.00073.2013',
  },
  saul2015: {
    id: 'saul2015',
    authors: 'Saul KR, Hu X, Goehler CM, Vidt ME, Daly M, Velisar A, Murray WM',
    year: 2015,
    title: 'Benchmarking of dynamic simulation predictions in two software platforms using an upper limb musculoskeletal model',
    venue: 'Comput Methods Biomech Biomed Engin 18:1445–1458',
    doi: '10.1080/10255842.2014.916698',
  },
  binderMarkey2023: {
    id: 'binderMarkey2023',
    authors: 'Binder-Markey BI, Persad LS, Shin AY, Litchy WJ, Kaufman KR, Lieber RL',
    year: 2023,
    title: 'Direct intraoperative measurement of isometric contractile properties in living human muscle',
    venue: 'J Physiol 601:1817–1830',
    doi: '10.1113/JP284092',
  },
  delp1996: {
    id: 'delp1996',
    authors: 'Delp SL, Grierson AE, Buchanan TS',
    year: 1996,
    title: 'Maximum isometric moments generated by the wrist muscles in flexion-extension and radial-ulnar deviation',
    venue: 'J Biomech 29:1371–1375',
    doi: '10.1016/0021-9290(96)00029-2',
  },
  thelen2003: {
    id: 'thelen2003',
    authors: 'Thelen DG',
    year: 2003,
    title: 'Adjustment of muscle mechanics model parameters to simulate dynamic contractions in older adults',
    venue: 'J Biomech Eng 125:70–77',
    doi: '10.1115/1.1531112',
  },
  davidsonCharles2017: {
    id: 'davidsonCharles2017',
    authors: 'Davidson A, Charles S',
    year: 2017,
    title: 'Fundamental principles of tremor propagation in the upper limb',
    venue: 'Ann Biomed Eng 45:1133–1147',
    doi: '10.1007/s10439-016-1765-5',
  },
};

/** Google Scholar search for the exact title. */
export const scholarUrl = (r: Reference) => `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${r.title}"`)}`;

/** The publisher's page (DOI) or, without a DOI, PubMed. */
export const sourceUrl = (r: Reference) =>
  r.doi ? `https://doi.org/${r.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`;

export const shortCite = (r: Reference) => `${r.authors.split(',')[0]!.split(' ')[0]}${r.authors.includes(',') ? ' et al.' : ''} ${r.year}`;

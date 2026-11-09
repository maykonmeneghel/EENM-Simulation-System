import type { FieldPath } from '../application/formModel';
import type { ReferenceId } from '../domain/references';
import { REFERENCES, shortCite, sourceUrl } from '../domain/references';
import { tr } from '../i18n/locale';
import { HelpButton } from './HelpButton';

function Source({ id }: { id: ReferenceId }) {
  const r = REFERENCES[id];
  return (
    <a href={sourceUrl(r)} target="_blank" rel="noreferrer">
      {shortCite(r)}
    </a>
  );
}

/** Help of the wrist choices (engine `domain/wrist_joint.py`): what each option means, with its source. */
export function WristHelp({ path }: { path: FieldPath }) {
  if (path === 'joint.peakForce') {
    const label = tr({ 'pt-BR': 'Força máxima', en: 'Peak force' });
    return (
      <HelpButton label={label}>
        {tr({
          'pt-BR':
            'Quanta força o músculo faz com todas as unidades ativas. Ela vira torque no punho: força × braço de momento ' +
            '(FCR 14,9 mm, ECR 11,5 mm). As duas fontes discordam cerca de 3 vezes; escolha qual usar.',
          en:
            'How much force the muscle makes with every unit active. It becomes wrist torque: force × moment arm ' +
            '(FCR 14.9 mm, ECR 11.5 mm). The two sources disagree about threefold; choose which one to use.',
        })}
        <br />
        <strong>Saul 2015:</strong>{' '}
        {tr({
          'pt-BR': 'FCR 407,9 N, ECR 589,8 N, do modelo do membro superior (tensão específica ajustada de 50,8 N/cm², texto completo) — ',
          en: 'FCR 407.9 N, ECR 589.8 N, from the upper-limb model (fitted specific tension 50.8 N/cm², full text) — ',
        })}
        <Source id="saul2015" />.
        <br />
        <strong>Binder-Markey 2023:</strong>{' '}
        {tr({
          'pt-BR':
            'as mesmas forças reescaladas para 17,1 N/cm², a tensão medida diretamente em músculo humano vivo (grácil, ' +
            'só o resumo lido): FCR ≈ 137 N, ECR ≈ 199 N — ',
          en:
            'the same forces rescaled to 17.1 N/cm², the tension measured directly in living human muscle (gracilis, ' +
            'abstract only): FCR ≈ 137 N, ECR ≈ 199 N — ',
        })}
        <Source id="binderMarkey2023" />.
        <br />
        {tr({
          'pt-BR': 'Nas duas, o músculo perde força quando encurta rápido (força–velocidade, Vmax = 10 fibras/s) — ',
          en: 'In both, the muscle loses force when it shortens fast (force–velocity, Vmax = 10 fibre lengths/s) — ',
        })}
        <Source id="thelen2003" />.
      </HelpButton>
    );
  }
  if (path === 'joint.passive') {
    const label = tr({ 'pt-BR': 'Punho passivo', en: 'Passive wrist' });
    return (
      <HelpButton label={label}>
        {tr({
          'pt-BR':
            'O que puxa o punho de volta quando o músculo relaxa (tecidos, tendões, pele). As duas medidas discordam; escolha qual usar.',
          en: 'What pulls the wrist back when the muscle relaxes (tissues, tendons, skin). The two measurements disagree; choose which one to use.',
        })}
        <br />
        <strong>Davidson 2017:</strong>{' '}
        {tr({
          'pt-BR':
            'mola linear de 0,992 N·m por radiano, medida com empurrões pequenos perto do neutro (texto completo). O punho volta rápido e ' +
            'oscila: passa do neutro para o outro lado antes de parar — ',
          en:
            'a linear spring of 0.992 N·m per radian, measured with small pushes near neutral (full text). The wrist returns fast and ' +
            'swings: it passes neutral to the other side before it stops — ',
        })}
        <Source id="davidsonCharles2017" />.
        <br />
        <strong>Delp 1996:</strong>{' '}
        {tr({
          'pt-BR':
            'quase zero nos 150° centrais, subindo a 0,5 N·m a 90° de flexão e 1,2 N·m a 90° de extensão (10 homens; só o ' +
            'resumo lido). A curva entre 75° e 90° é desenhada por este modelo, não medida. Sem rebote, mas o punho quase ' +
            'não volta sozinho (a gravidade não é simulada) — ',
          en:
            'near zero in the central 150°, rising to 0.5 N·m at 90° flexion and 1.2 N·m at 90° extension (10 men; ' +
            'abstract only). The curve between 75° and 90° is drawn by this model, not measured. No rebound, but the wrist ' +
            'hardly returns by itself (gravity is not simulated) — ',
        })}
        <Source id="delp1996" />.
        <br />
        {tr({
          'pt-BR': 'Nos dois, o punho para em 90° de flexão e 90° de extensão, onde esse estudo mediu.',
          en: 'In both, the wrist stops at 90° flexion and 90° extension, where that study measured.',
        })}
      </HelpButton>
    );
  }
  return null;
}

import React from 'react';
import { Link } from 'react-router-dom';
import { date, number } from './GestorIaContext';
import { formatMetric } from './gestorIaMetricModel';
import { MEDIA_GOAL_OBJECTIVES } from './gestorIaMediaGoalModel';

export default function GestorIaPortfolioGoal({ to, state, goal, progress, unavailable }) {
  const objective = MEDIA_GOAL_OBJECTIVES[goal.objective];
  const through = progress?.through && date(progress.through).slice(0, 5);
  return <div className="gia-portfolio-goal" data-tone={progress?.tone}>
    <Link className="gia-row-link" to={to} state={state}>{goal.name}</Link>
    {progress?.volumePercent != null ? <>
      <small><strong>{number(progress.results)}</strong> de {number(goal.result_target)} {objective.volume.toLocaleLowerCase('pt-BR')}</small>
      <div className="gia-media-rail" aria-hidden="true"><i style={{ width: `${Math.min(100, progress.volumePercent)}%` }} /></div>
    </> : <small>{objective.cost} alvo {formatMetric(goal.cost_cents / 100, { unit: 'money' }, 'BRL')}</small>}
    {(progress?.status || through || unavailable) && <small className="gia-portfolio-goal-note">
      {progress?.status && <span>{progress.status}</span>}{progress?.status && through && ' · '}{through && `até ${through}`}{unavailable && 'Leitura indisponível'}
    </small>}
  </div>;
}

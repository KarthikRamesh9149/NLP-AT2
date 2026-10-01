import { useId } from 'react';

export function TableSetting() {
  const id = useId();
  const paint = (name: string) => `url(#${id}-${name})`;
  return <div className="table-setting" aria-hidden="true">
    <svg viewBox="0 0 380 250" fill="none">
      <defs>
        <radialGradient id={`${id}-glaze`} cx="35%" cy="25%" r="80%"><stop stopColor="#fffffc" /><stop offset=".65" stopColor="#f0f0df" /><stop offset="1" stopColor="#c5ceba" /></radialGradient>
        <radialGradient id={`${id}-well`} cx="65%" cy="70%" r="85%"><stop stopColor="#fdfdf2" /><stop offset=".7" stopColor="#eeefdf" /><stop offset="1" stopColor="#d5ddca" /></radialGradient>
        <linearGradient id={`${id}-linen`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#adc6af" /><stop offset=".55" stopColor="#739883" /><stop offset="1" stopColor="#abc2a5" /></linearGradient>
        <linearGradient id={`${id}-napkin`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f4ebc6" /><stop offset="1" stopColor="#c4b67c" /></linearGradient>
        <linearGradient id={`${id}-silver`}><stop stopColor="#879d8e" /><stop offset=".45" stopColor="#f5f3db" /><stop offset=".65" stopColor="#bdc8b0" /><stop offset="1" stopColor="#7c9584" /></linearGradient>
        <pattern id={`${id}-weave`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 .5h5M.5 0v5" stroke="#f1f5da" strokeOpacity=".17" strokeWidth=".5" /></pattern>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="160%" height="160%"><feDropShadow dx="4" dy="9" stdDeviation="7" floodColor="#051f1c" floodOpacity=".32" /></filter>
      </defs>
      <g transform="rotate(-8 192 126)">
        <path d="M121 26h142v192H121Z" fill={paint('linen')} filter={paint('shadow')} />
        <path d="M121 26h142v192H121Z" fill={paint('weave')} />
        <path d="M127 32h130v180H127Z" stroke="#d8e2c0" strokeOpacity=".4" strokeDasharray="2 3" />
      </g>
      <circle cx="192" cy="119" r="89" fill={paint('glaze')} filter={paint('shadow')} />
      <circle cx="192" cy="119" r="82" stroke="#7f9771" strokeWidth="1.3" />
      <circle cx="192" cy="119" r="78" stroke="#acb79b" strokeWidth=".6" />
      <path d="M121 82a80 80 0 0 1 112-35" stroke="#fffffb" strokeWidth="2" strokeLinecap="round" opacity=".85" />
      <circle cx="192" cy="119" r="65" fill={paint('well')} />
      <circle cx="192" cy="119" r="64" stroke="#c3ceb6" strokeWidth=".7" />
      <path d="M153 103 193 81l33 52-41 25Z" fill="#6d785c" opacity=".15" transform="translate(2 4)" />
      <path d="M150 100 191 79l34 52-41 24Z" fill={paint('napkin')} />
      <path d="M150 100 191 79l34 52-41 24Z" fill={paint('weave')} />
      <path d="m154 101 35-18 31 47-35 20Z" stroke="#fff5d0" strokeOpacity=".75" strokeWidth=".7" />
      <path d="m191 79-7 76m0 0-12-65" stroke="#b3a26c" strokeWidth=".7" />
      <g transform="rotate(30 193 118)">
        <path d="M191 151c0-19 1-39 4-65" stroke="#486448" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M193 137c-13-2-17-9-14-14 9 1 14 7 14 14Z" fill="#66835c" />
        <path d="M193 126c11-2 17-9 15-15-9 2-15 7-15 15Z" fill="#526f4d" />
        <path d="M194 114c-11-2-16-8-13-14 8 1 13 7 13 14Z" fill="#819667" />
        <path d="M195 102c10-2 14-8 12-13-8 2-12 6-12 13Z" fill="#5a7950" />
        <path d="M195 90c-5-5-5-10-1-14 5 5 5 10 1 14Z" fill="#91a477" />
      </g>
      <g stroke={paint('silver')} strokeLinecap="round" strokeLinejoin="round">
        <path d="M80 57v34m-6-34v28m12-28v28m-18-28v28c0 13 24 13 24 0V57M80 100v90" strokeWidth="3.5" />
        <path d="M303 67v124m0-124c-11 17-14 34-11 47h11" strokeWidth="4" />
      </g>
      <path d="M79 104v81m223-66v65" stroke="#f5f4d7" strokeWidth=".7" opacity=".7" />
      <g stroke="#b7d1c1" strokeLinecap="round">
        <ellipse cx="309" cy="30" rx="21" ry="23" fill="#c7dfca" fillOpacity=".06" strokeWidth="1.2" />
        <ellipse cx="309" cy="28" rx="16" ry="17" strokeWidth=".5" opacity=".6" />
        <path d="M309 54v16m-13 1h26M296 22c-3 8-2 15 1 19" strokeWidth="1.2" />
      </g>
    </svg>
    <span className="setting-caption">Thoughtful from the first hello.</span>
  </div>;
}

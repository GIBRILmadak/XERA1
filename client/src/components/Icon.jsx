/** Icône Google Material Symbols (Rounded). `name` = nom officiel, ex. "home". */
export default function Icon({ name, filled = false, size, className = '', label, style }) {
  return (
    <span
      className={`icon${filled ? ' is-filled' : ''}${className ? ` ${className}` : ''}`}
      style={size ? { fontSize: size, ...style } : style}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
}

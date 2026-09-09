import React from 'react';

export function Emoji({ children, className = '' }) {
  const extra = className ? ` ${className}` : '';
  return <i className={`tg-emoji${extra}`}>{children}</i>;
}

export default Emoji;
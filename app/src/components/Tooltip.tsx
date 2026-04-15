'use client';

import { type ReactNode } from 'react';

interface Props {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({ content, children, position = 'top', className = '' }: Props) {
  const isTop = position === 'top';
  return (
    <span className={`relative group/tip inline-flex items-center cursor-help ${className}`}>
      {children}
      <span
        className={`pointer-events-none absolute ${isTop ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 -translate-x-1/2 z-50
          hidden group-hover/tip:flex flex-col items-center`}
      >
        {isTop && <span className="bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-xl max-w-[220px] text-center leading-relaxed whitespace-pre-line">{content}</span>}
        {isTop && <span className="border-[5px] border-transparent border-t-gray-900 -mt-px" />}
        {!isTop && <span className="border-[5px] border-transparent border-b-gray-900 -mb-px" />}
        {!isTop && <span className="bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-xl max-w-[220px] text-center leading-relaxed whitespace-pre-line">{content}</span>}
      </span>
    </span>
  );
}

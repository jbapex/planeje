import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * TooltipCustom component that renders a tooltip balloon using React Portal.
 * Designed to avoid clipping issues in containers with overflow hidden/auto.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - The element that triggers the tooltip.
 * @param {React.ReactNode} props.content - The content to be displayed inside the tooltip.
 * @param {'top' | 'bottom' | 'left' | 'right'} [props.side='right'] - The side where the tooltip appears.
 * @param {string} [props.className] - Additional classes for the tooltip balloon.
 */
export const TooltipCustom = ({ 
  children, 
  content, 
  side = 'right', 
  className,
  triggerClassName
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  // Function to calculate position based on trigger element and desired side
  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top, left;

      // Calculate base coordinates relative to the viewport + scroll
      switch (side) {
        case 'right':
          top = rect.top + rect.height / 2 + window.scrollY;
          left = rect.right + 8 + window.scrollX;
          break;
        case 'left':
          top = rect.top + rect.height / 2 + window.scrollY;
          left = rect.left - 8 + window.scrollX;
          break;
        case 'top':
          top = rect.top - 8 + window.scrollY;
          left = rect.left + rect.width / 2 + window.scrollX;
          break;
        case 'bottom':
          top = rect.bottom + 8 + window.scrollY;
          left = rect.left + rect.width / 2 + window.scrollX;
          break;
        default:
          top = rect.top + rect.height / 2 + window.scrollY;
          left = rect.right + 8 + window.scrollX;
      }

      setCoords({ top, left });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      // Add event listeners to update position on scroll or resize
      window.addEventListener('scroll', updatePosition, { passive: true });
      window.addEventListener('resize', updatePosition);
    }
    
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, side]);

  // Framer motion variants for smooth entry and exit
  const getInitial = () => {
    if (side === 'right') return { opacity: 0, scale: 0.9, x: -5, y: '-50%' };
    if (side === 'left') return { opacity: 0, scale: 0.9, x: 5, y: '-50%' };
    if (side === 'top') return { opacity: 0, scale: 0.9, y: 5, x: '-50%' };
    if (side === 'bottom') return { opacity: 0, scale: 0.9, y: -5, x: '-50%' };
    return { opacity: 0, scale: 0.9 };
  };

  const getAnimate = () => {
    if (side === 'right' || side === 'left') return { opacity: 1, scale: 1, x: 0, y: '-50%' };
    if (side === 'top' || side === 'bottom') return { opacity: 1, scale: 1, x: '-50%', y: 0 };
    return { opacity: 1, scale: 1 };
  };

  const getExit = () => {
    if (side === 'right') return { opacity: 0, scale: 0.9, x: -5, y: '-50%' };
    if (side === 'left') return { opacity: 0, scale: 0.9, x: 5, y: '-50%' };
    if (side === 'top') return { opacity: 0, scale: 0.9, y: 5, x: '-50%' };
    if (side === 'bottom') return { opacity: 0, scale: 0.9, y: -5, x: '-50%' };
    return { opacity: 0, scale: 0.9 };
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className={triggerClassName}
      >
        {children}
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isVisible && content && (
            <motion.div
              initial={getInitial()}
              animate={getAnimate()}
              exit={getExit()}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                top: coords.top,
                left: coords.left,
                zIndex: 9999,
                pointerEvents: 'none',
              }}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-slate-800 rounded-md shadow-lg whitespace-nowrap border border-slate-700/50",
                className
              )}
            >
              {content}
              {/* Tooltip Arrow */}
              <div 
                className={cn(
                  "absolute w-1.5 h-1.5 bg-slate-900 dark:bg-slate-800 border-slate-700/50 transform rotate-45",
                  side === 'right' && "left-[-4px] top-1/2 -translate-y-1/2 border-l border-b",
                  side === 'left' && "right-[-4px] top-1/2 -translate-y-1/2 border-r border-t",
                  side === 'top' && "bottom-[-4px] left-1/2 -translate-x-1/2 border-r border-b",
                  side === 'bottom' && "top-[-4px] left-1/2 -translate-x-1/2 border-l border-t"
                )}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

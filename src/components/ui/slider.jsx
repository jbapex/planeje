import React from 'react';
import { cn } from '@/lib/utils';

const Slider = React.forwardRef(({ className, value, onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => {
  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    if (onValueChange) {
      onValueChange([newValue]);
    }
  };

  const currentValue = Array.isArray(value) ? value[0] : value || min;

  return (
    <div className="relative flex w-full items-center">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={handleChange}
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700',
          'accent-primary',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-all',
          '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          className
        )}
        ref={ref}
        {...props}
      />
    </div>
  );
});

Slider.displayName = 'Slider';

export { Slider };


import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

export interface SearchableSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  icon?: React.ReactNode;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = '-- Select --',
  searchPlaceholder = 'Type to search...',
  disabled = false,
  className = '',
  emptyMessage = 'No matching options found',
  icon,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const filteredOptions = options.filter(opt => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      opt.label.toLowerCase().includes(q) ||
      opt.value.toLowerCase().includes(q) ||
      (opt.subLabel && opt.subLabel.toLowerCase().includes(q)) ||
      (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  });

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        className={`w-full px-3 py-2 bg-white border rounded-md text-left text-sm flex items-center justify-between gap-2 transition cursor-pointer select-none ${
          disabled
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : isOpen
            ? 'border-sky-500 ring-2 ring-sky-500/20'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
          {selectedOption ? (
            <div className="min-w-0 flex-1 flex items-center gap-1.5 truncate">
              <span className="font-mono font-semibold text-slate-800 text-xs sm:text-sm">
                {selectedOption.label}
              </span>
              {selectedOption.subLabel && (
                <span className="text-slate-500 text-xs truncate">
                  • {selectedOption.subLabel}
                </span>
              )}
            </div>
          ) : value ? (
            <div className="min-w-0 flex-1 flex items-center gap-1.5 truncate">
              <span className="font-mono font-semibold text-slate-800 text-xs sm:text-sm">
                {value}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 text-sm font-sans">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(selectedOption || value) && !disabled && (
            <span
              onClick={handleClear}
              title="Clear selection"
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-sky-600' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Searchable Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-hidden focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearchQuery('');
                  } else if (e.key === 'Enter' && filteredOptions.length > 0) {
                    e.preventDefault();
                    handleSelect(filteredOptions[0].value);
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Option List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100/60 p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-4 px-3 text-center text-xs text-slate-400 italic">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full px-2.5 py-2 text-left rounded-md flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50 text-sky-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-slate-900">
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 font-mono text-[10px] rounded border border-slate-200">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.subLabel && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-sans">
                          {opt.subLabel}
                        </p>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-sky-600 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer count indicator */}
          <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
            <span>
              {filteredOptions.length} of {options.length} {options.length === 1 ? 'option' : 'options'}
            </span>
            <span className="text-[9px] text-slate-400 font-mono">
              ESC to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
};


import React, { createContext, useContext, useState } from 'react';

interface FilterContextValue {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCommunityId: string;
  setSelectedCommunityId: (id: string) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommunityId, setSelectedCommunityId] = useState('');

  return (
    <FilterContext.Provider
      value={{ searchQuery, setSearchQuery, selectedCommunityId, setSelectedCommunityId }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useGlobalFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error('useGlobalFilter must be used inside FilterProvider');
  }
  return ctx;
}

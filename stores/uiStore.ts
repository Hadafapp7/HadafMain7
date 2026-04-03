import { create } from 'zustand';

interface UIStore {
  isGlobalLoading: boolean;
  activeModal: string | null;
  setGlobalLoading: (loading: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isGlobalLoading: false,
  activeModal: null,
  setGlobalLoading: (isGlobalLoading) => set({ isGlobalLoading }),
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
}));

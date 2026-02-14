import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface PortsState {
	// UI preferences (persisted)
	isListCollapsed: boolean;

	setListCollapsed: (collapsed: boolean) => void;
	toggleListCollapsed: () => void;
}

export const usePortsStore = create<PortsState>()(
	devtools(
		persist(
			(set, get) => ({
				isListCollapsed: false,

				setListCollapsed: (collapsed) => set({ isListCollapsed: collapsed }),

				toggleListCollapsed: () =>
					set({ isListCollapsed: !get().isListCollapsed }),
			}),
			{
				name: "ports-store",
				partialize: (state) => ({
					isListCollapsed: state.isListCollapsed,
				}),
			},
		),
		{ name: "PortsStore" },
	),
);

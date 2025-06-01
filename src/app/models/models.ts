export interface Inventory {
  id: number;
  version: number;
  set_num: string;
}

export interface InventoryPart {
  inventory_id: number;
  img_url: string;
  part_num: string;
  color_id: number;
  quantity: number;
  is_spare: boolean;
}

export interface InventoryMinifig {
  inventory_id: number;
  fig_num: string;
  quantity: number;
}

export interface InventorySet {
  inventory_id: number;
  set_num: string;
  quantity: number;
}

export interface Part {
  part_num: string;
  name: string;
  part_cat_id: number;
}

export interface Color {
  id: number;
  name: string;
  rgb: string;
  is_trans: boolean;
}

export interface PartCategory {
  id: number;
  name: string;
}

export interface PartRelationship {
  rel_type: string;
  child_part_num: string;
  parent_part_num: string;
}

export interface Element {
  element_id: string;
  part_num: string;
  color_id: number;
}

export interface Minifig {
  fig_num: string;
  name: string;
  num_parts: number;
  img_url: string;
}

export interface PartialSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  img_url: string;
}

export interface Set extends PartialSet {
  versions: number[];
}

export interface Theme {
  id: number;
  name: string;
  parent_id: number;
}

// User-specific tracking interfaces
export interface UserInventory {
  id: string; // Unique identifier for this user inventory
  set_num: string;
  version: number;
  name: string;
  partsOwned: Record<string, number>; // part_num+color_id -> quantity owned
  minifigsOwned: Record<string, number>; // fig_num -> quantity owned
  minifigPartsOwned: Record<string, number>; // setNum_figNum_partNum_colorId -> quantity owned
  collapsedMinifigParts?: string[]; // fig_nums that have collapsed parts (expanded by default)
  lastUpdated: number; // timestamp
  sortPreferences?: {
    parts: SortOption[];
    minifigs: SortOption[];
    spareParts: SortOption[];
  };
  viewPreferences?: {
    parts: 'tiles' | 'list';
    minifigs: 'tiles' | 'list';
    spareParts: 'tiles' | 'list';
  };
  undoHistory?: UndoAction[]; // Max 100 actions
}

export interface SortOption {
  field: 'completion' | 'color' | 'partNumber' | 'partName' | 'elementId' | 'quantityMissing' | 'quantityNeeded' | 'figNumber' | 'figName' | 'setNumber' | 'setName';
  direction: 'asc' | 'desc';
}

export interface UndoAction {
  type: 'part' | 'minifig' | 'minifig-part';
  key: string; // part key or minifig fig_num or minifigure part key
  previousQuantity: number;
  newQuantity: number;
  timestamp: number;
  description: string; // Human readable description of the action
}

export interface GlobalSettings {
  imagePreviewSize: '1x' | '2x' | '4x';
  includeSparePartsInProgress: boolean; // Whether to include spare parts in overall progress calculation
}

export interface AppState {
  userInventories: UserInventory[];
  activeInventoryId: string | null;
  globalSettings: GlobalSettings;
}

// CSV file splitting manifest
export interface CSVManifest {
  [fileName: string]: number; // fileName -> number of parts (1 if not split)
}

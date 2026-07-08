export const WAGON_TYPES = {
  hopper:       { id: 'hopper',       label: 'Open Hopper Coal',   color: '#111111', textColor: '#ffffff' },
  box:          { id: 'box',          label: 'Boxcar',             color: '#6b3e16', textColor: '#ffffff' },
  tank:         { id: 'tank',         label: 'Tank Car',           color: '#c0c0c0', textColor: '#111111' },
  refrigerator: { id: 'refrigerator', label: 'Refrigerator Car',   color: '#f5f5f5', textColor: '#111111' },
  flatcar:      { id: 'flatcar',      label: 'Flatcar',            color: '#d9c89e', textColor: '#111111' }
};

export const WAGON_LIST = Object.values(WAGON_TYPES);

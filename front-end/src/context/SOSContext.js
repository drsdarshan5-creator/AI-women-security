import React, { createContext, useState } from 'react';

export const SOSContext = createContext({
  alertActive: false,
  triggerSOS: () => {},
  cancelSOS: () => {},
});

export function SOSProvider({ children }) {
  const [alertActive, setAlertActive] = useState(false);

  const triggerSOS = () => setAlertActive(true);
  const cancelSOS = () => setAlertActive(false);

  return (
    <SOSContext.Provider value={{ alertActive, triggerSOS, cancelSOS }}>
      {children}
    </SOSContext.Provider>
  );
}

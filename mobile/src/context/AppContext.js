import React, { createContext, useContext, useReducer } from 'react';

const AppContext = createContext();

const initialState = {
  mode: null,
  cellData: null,
  forkliftData: null,
  currentRequest: null,
  incomingRequest: null,
  systemStatus: null,
  isConnected: false,
  isOnLeave: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_CELL_DATA':
      return { ...state, cellData: action.payload };
    case 'SET_FORKLIFT_DATA':
      return { ...state, forkliftData: action.payload };
    case 'SET_CURRENT_REQUEST':
      return { ...state, currentRequest: action.payload };
    case 'SET_INCOMING_REQUEST':
      return { ...state, incomingRequest: action.payload };
    case 'SET_SYSTEM_STATUS':
      return { ...state, systemStatus: action.payload };
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };
    case 'SET_ON_LEAVE':
      return { ...state, isOnLeave: action.payload };
    case 'CLEAR_REQUEST':
      return { ...state, currentRequest: null, incomingRequest: null };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
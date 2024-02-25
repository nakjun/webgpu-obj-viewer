import React, { useEffect, useRef } from 'react';
import logo from './logo.svg';
import './App.css';

import ObjFileLoader from './Components/ObjFileLoader';
import { Initialize } from './Components/RendererModule';


function App() {
  let start = false;
  useEffect(() => {
    if(!start) {
      Initialize();
      start = true;
    }
  }, []);


  return (
    <div>      
      <canvas id="gfx-main" width="1920" height="800"></canvas>
    </div>
  );
}

export default App;

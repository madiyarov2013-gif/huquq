import React from 'react';
import { useNavigate } from 'react-router-dom';

export const WalleBot: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="walle-widget-anchor" onClick={() => navigate('/ai-assistant')}>
      {/* Ambient glow aura behind everything */}
      <div className="walle-aura"></div>

      {/* Floating energy particles */}
      <div className="walle-particles">
        <span className="walle-particle p1"></span>
        <span className="walle-particle p2"></span>
        <span className="walle-particle p3"></span>
        <span className="walle-particle p4"></span>
        <span className="walle-particle p5"></span>
        <span className="walle-particle p6"></span>
      </div>

      <div className="walle-bot-wrapper floating">
        <div className="walle-hover-shadow"></div>
        <div className="walle-bot-body">
          {/* Head */}
          <div className="bot-head">
            <div className="bot-antenna">
              <div className="antenna-beam"></div>
              <div className="bulb"></div>
            </div>
            <div className="bot-ear left"></div>
            <div className="bot-ear right"></div>
            <div className="bot-face-screen">
              <div className="screen-grid"></div>
              <div className="screen-scanline"></div>
              <div className="screen-glare"></div>
              <div className="bot-face">
                <div className="bot-eye left">
                  <div className="eye-pupil"></div>
                </div>
                <div className="bot-eye right">
                  <div className="eye-pupil"></div>
                </div>
                <div className="bot-mouth"></div>
              </div>
            </div>
          </div>

          {/* Neck */}
          <div className="bot-neck">
            <div className="neck-joint"></div>
          </div>

          {/* Torso */}
          <div className="bot-torso">
            <div className="chest-core">
              <div className="core-ring"></div>
              <div className="core-ring core-ring-2"></div>
            </div>
            <div className="status-leds">
              <span className="led led-1"></span>
              <span className="led led-2"></span>
              <span className="led led-3"></span>
            </div>
            <div className="torso-line line-1"></div>
            <div className="torso-line line-2"></div>
            <div className="torso-line line-3"></div>
          </div>

          {/* Arms */}
          <div className="bot-arm left">
            <div className="arm-joint"></div>
            <div className="hand">
              <div className="finger f1"></div>
              <div className="finger f2"></div>
            </div>
          </div>
          <div className="bot-arm right">
            <div className="arm-joint"></div>
            <div className="hand">
              <div className="finger f1"></div>
              <div className="finger f2"></div>
            </div>
          </div>

          {/* Legs / Treads */}
          <div className="bot-base">
            <div className="tread left">
              <div className="tread-glow"></div>
            </div>
            <div className="tread right">
              <div className="tread-glow"></div>
            </div>
          </div>

          {/* Ground hover thruster glow */}
          <div className="walle-thruster"></div>
        </div>
      </div>
    </div>
  );
};

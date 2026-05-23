import React from 'react';
import { useNavigate } from 'react-router-dom';

export const WalleBot: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="walle-widget-anchor" onClick={() => navigate('/ai-assistant')}>
      <div className="walle-bot-wrapper floating">
        <div className="walle-hover-shadow"></div>
        <div className="walle-bot-body">
          {/* Head */}
          <div className="bot-head">
            <div className="bot-antenna">
              <div className="bulb"></div>
            </div>
            <div className="bot-ear left"></div>
            <div className="bot-ear right"></div>
            <div className="bot-face-screen">
              <div className="screen-scanline"></div>
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
            <div className="chest-core"></div>
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
            <div className="tread left"></div>
            <div className="tread right"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

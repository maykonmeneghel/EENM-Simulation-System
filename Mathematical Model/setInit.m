%% BEGIN FUNCTIONS
%% setInit(): sets and returns an initial value vector
function y0 = setInit()
    % soma initial conditions
    vs=-57.34;
    snah=0.5829;
    sn=0.1239;
    scam=0.004199;
    scah=0.9219;
    sca=0.0001406;
    % dendrite initial conditions
    vd=-56.64;
    dcas=0.08493;
    dca=0.01724;
    mnap=0.1; 
    hnap=0.9;
%     va = -60;
%     snahA=0.5829;
%     snA=0.1239;
    y0 = [vs; snah; sn; scam; scah; sca; vd; dcas; dca; mnap; hnap];
end
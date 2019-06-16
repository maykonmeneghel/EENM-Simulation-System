%% rates(t,y): incorporates the rate equations of the model
function dydt = ratesS(t,y, Area, Parameters, key)
    
    %% % Model parameters
    vna=115.0;
    vk=-20.0;
    vl=0.0;
    vca=140.0;
    vrest=-60.0; 
    
    gls = 0.51;
    gld = 0.51;
    Cd  = 1.0;
    Cs  = 1.0;
    gc  = 0.1;
    
    p=1; 
    kd=0.2; 
    f=0.01; 
    kca=2.0; 
    alpha=0.009;
    % Soma parameters
    sgna=80.0; 
    sgk=100.0; 
    sgca=14.0; 
    camtau=4.0; 
    cahtau=40.0; 
    sgkca=6;
    % Dendrite parameters
    dcastau=40.0; 
    taunap=40; 
    naptau=1000; 
    % Soma-dendrite coupling parameters

    perkca=1.0; 
    
    % Parameters sensitive to SCI
    dgkca=1.0; 
    gnap=0.1; 
    dgcas=0.25; 
    alpha2=0.009; 
    pernap=1;    
    
    %+(-1+2*rand()); % aleatoriedade
    %% Assign state variables    
    vs = y(1); 
    snah = y(2); 
    sn = y(3); 
    scam = y(4); 
    scah = y(5); 
    sca = y(6); 
    vd = y(7); 
    dcas = y(8); 
    dca = y(9); 
    mnap = y(10); 
    hnap = y(11);

    %% Get instantaneous value for the injected ramp current 
    if (key)
        IappS= FES(t,Parameters); %ramp(t);
        IappD= 0;
    else
        IappS= 0;
        IappD= FES(t,Parameters);
    end
    temp = 3^((Parameters.FES.Temperature-6.3)/10);
    %% 
    % Somatic variables
    dydt(1)=((IappS)-sgna*snaminf(vs)^3*snah*(vs-(vna+vrest))-sgca*scam^2*scah*(vs-(vca+vrest))-sgk*sn^4*(vs-(vk+vrest))-perkca*sgkca*(sca^p/(kd^p+sca^p))*(vs-(vk+vrest))-gls*(vs-(vl+vrest))+gc*(vd-vs)/Area)/Cs;
    dydt(2)=((snahinf(vs)-snah)/snahtau(vs))*temp;
    dydt(3)=((sninf(vs)-sn)/sntau(vs))*temp;
    dydt(4)=((scaminf(vs)-scam)/camtau)*temp;
    dydt(5)=((scahinf(vs)-scah)/cahtau)*temp;
    dydt(6)=(-f*alpha*sgca*scam^2*scah*(vs-(vca+vrest))-f*kca*sca)*temp;

    % Dendritic variables
    dydt(7)=((IappD)-dgcas*dcas*(vd-(vca+vrest))-pernap*gnap*mnap*hnap*(vd-(vna+vrest))-perkca*dgkca*(dca^p/(kd^p+dca^p))*(vd-(vk+vrest))-gld*(vd-(vl+vrest))+gc*(vs-vd)/(1.0-Area))/Cd;
    dydt(8)=((dcasinf(vd)-dcas)/dcastau)*temp;
    dydt(9)=(-f*alpha2*dgcas*dcas*(vd-(vca+vrest))-f*kca*dca)*temp;
    dydt(10)=((minfnap(vd)-mnap)/taunap)*temp;
    dydt(11)=((hinfnap(vd)-hnap)/naptau)*temp;
    dydt = dydt';
    
end


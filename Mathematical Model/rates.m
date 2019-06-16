function dydt = rates(t,y, Area, Parameters, key)
%% rates(t,y): incorporates the rate equations of the model
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
        IappS= FES(t,Parameters.data); %ramp(t);
        IappD= 0;
    else
        IappS= 0;
        IappD= FES(t,Parameters.data);
    end
    temp = 3^((Parameters.data.Motoneurons.Temperature-6.3)/10);
    %% 
    % Somatic variables
    dydt(1)=((IappS)-Parameters.data.Motoneurons.Conductances.sgna*snaminf(vs)^3*snah*(vs-(Parameters.data.Motoneurons.Conductances.vna+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.sgca*scam^2*scah*(vs-(Parameters.data.Motoneurons.Conductances.vca+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.sgk*sn^4*(vs-(Parameters.data.Motoneurons.Conductances.vk+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.perkca*Parameters.data.Motoneurons.Conductances.sgkca*(sca^Parameters.data.Motoneurons.Conductances.p/(Parameters.data.Motoneurons.Conductances.kd^Parameters.data.Motoneurons.Conductances.p+sca^Parameters.data.Motoneurons.Conductances.p))*(vs-(Parameters.data.Motoneurons.Conductances.vk+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.gls*(vs-(Parameters.data.Motoneurons.Conductances.vl+Parameters.data.Motoneurons.Conductances.vrest))+Parameters.data.Motoneurons.Conductances.gc*(vd-vs)/Area)/Parameters.data.Motoneurons.Conductances.Cs;
    dydt(2)=((snahinf(vs)-snah)/snahtau(vs))*temp;
    dydt(3)=((sninf(vs)-sn)/sntau(vs))*temp;
    dydt(4)=((scaminf(vs)-scam)/Parameters.data.Motoneurons.Conductances.camtau)*temp;
    dydt(5)=((scahinf(vs)-scah)/Parameters.data.Motoneurons.Conductances.cahtau)*temp;
    dydt(6)=(-Parameters.data.Motoneurons.Conductances.f*Parameters.data.Motoneurons.Conductances.alpha*Parameters.data.Motoneurons.Conductances.sgca*scam^2*scah*(vs-(Parameters.data.Motoneurons.Conductances.vca+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.f*Parameters.data.Motoneurons.Conductances.kca*sca)*temp;
    % Dendritic variables
    dydt(7)=((IappD)-Parameters.data.Motoneurons.Conductances.dgcas*dcas*(vd-(Parameters.data.Motoneurons.Conductances.vca+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.pernap*Parameters.data.Motoneurons.Conductances.gnap*mnap*hnap*(vd-(Parameters.data.Motoneurons.Conductances.vna+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.perkca*Parameters.data.Motoneurons.Conductances.dgkca*(dca^Parameters.data.Motoneurons.Conductances.p/(Parameters.data.Motoneurons.Conductances.kd^Parameters.data.Motoneurons.Conductances.p+dca^Parameters.data.Motoneurons.Conductances.p))*(vd-(Parameters.data.Motoneurons.Conductances.vk+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.gld*(vd-(Parameters.data.Motoneurons.Conductances.vl+Parameters.data.Motoneurons.Conductances.vrest))+Parameters.data.Motoneurons.Conductances.gc*(vs-vd)/(1.0-Area))/Parameters.data.Motoneurons.Conductances.Cd;
    dydt(8)=((dcasinf(vd)-dcas)/Parameters.data.Motoneurons.Conductances.dcastau)*temp;
    dydt(9)=(-Parameters.data.Motoneurons.Conductances.f*Parameters.data.Motoneurons.Conductances.alpha2*Parameters.data.Motoneurons.Conductances.dgcas*dcas*(vd-(Parameters.data.Motoneurons.Conductances.vca+Parameters.data.Motoneurons.Conductances.vrest))-Parameters.data.Motoneurons.Conductances.f*Parameters.data.Motoneurons.Conductances.kca*dca)*temp;
    dydt(10)=((minfnap(vd)-mnap)/Parameters.data.Motoneurons.Conductances.taunap)*temp;
    dydt(11)=((hinfnap(vd)-hnap)/Parameters.data.Motoneurons.Conductances.naptau)*temp;
    dydt = dydt';
end


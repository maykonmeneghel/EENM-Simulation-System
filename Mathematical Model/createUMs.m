function Parameters = createUMs(muscleWork, somaFormatArea, dendriteFormatArea, compAxonal, Parameters, temperature)
    Parameters.data.Motoneurons.Temperature = temperature;   
    switch(muscleWork)
        case 'Soleus'
            Parameters.data.MuscleFibers.Muscle = 'Soleus';
            Parameters.data.Motoneurons.S.Quantity = 800;
            Parameters.data.Motoneurons.FR.Quantity = 50;
            Parameters.data.Motoneurons.FF.Quantity = 50;

        case 'Gastrocnemius Medial'
            Parameters.data.MuscleFibers.Muscle = 'Gastrocnemius Medial';
            Parameters.data.Motoneurons.S.Quantity = 250;
            Parameters.data.Motoneurons.FR.Quantity = 125;
            Parameters.data.Motoneurons.FF.Quantity = 125;

        case 'Gastrocnemius Lateral'
            Parameters.data.MuscleFibers.Muscle = 'Gastrocnemius Lateral';
            Parameters.data.Motoneurons.S.Quantity = 200;
            Parameters.data.Motoneurons.FR.Quantity = 100;
            Parameters.data.Motoneurons.FF.Quantity = 100;

        case 'Tibial Anterior'  
            Parameters.data.MuscleFibers.Muscle = 'Tibial Anterior';
            Parameters.data.Motoneurons.S.Quantity = 250;
            Parameters.data.Motoneurons.FR.Quantity = 50;
            Parameters.data.Motoneurons.FF.Quantity = 50;

    end
    Parameters.data.MuscleFibers.Type.S.APSF.Min=0.105;
    Parameters.data.MuscleFibers.Type.S.APSF.Max=0.125;
    Parameters.data.MuscleFibers.Type.S.APSF.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.S.APTF.Min=0.8;
    Parameters.data.MuscleFibers.Type.S.APTF.Max=0.7;
    Parameters.data.MuscleFibers.Type.S.APTF.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.S.APAT.Min=44;
    Parameters.data.MuscleFibers.Type.S.APAT.Max=47;
    Parameters.data.MuscleFibers.Type.S.APAT.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.S.MT.Min=0.103;  
    Parameters.data.MuscleFibers.Type.S.MT.Max=.123;
    Parameters.data.MuscleFibers.Type.S.MT.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.S.MTTP.Min=110;
    Parameters.data.MuscleFibers.Type.S.MTTP.Max=100;
    Parameters.data.MuscleFibers.Type.S.MTTP.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.S.MTF.Min=0.392;  
    Parameters.data.MuscleFibers.Type.S.MTF.Max=0.491;
    Parameters.data.MuscleFibers.Type.S.MTF.Distribution='Linear Interpolation';      
    Parameters.data.Motoneurons.S.Soma.Radius.Min = 77.5;
    Parameters.data.Motoneurons.S.Soma.Radius.Max = 82.5;
    Parameters.data.Motoneurons.S.Soma.Radius.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.S.Soma.Length.Min = 77.5;
    Parameters.data.Motoneurons.S.Soma.Length.Max = 82.5;
    Parameters.data.Motoneurons.S.Soma.Length.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.S.Dendrite.Radius.Min = 41.5;
    Parameters.data.Motoneurons.S.Dendrite.Radius.Max = 62.5;
    Parameters.data.Motoneurons.S.Dendrite.Radius.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.S.Dendrite.Length.Min = 5.5;
    Parameters.data.Motoneurons.S.Dendrite.Length.Max = 6.8;
    Parameters.data.Motoneurons.S.Dendrite.Length.Distribution = 'Linear Interpolation';

    Parameters.data.MuscleFibers.Type.FR.APSF.Min=0.125;
    Parameters.data.MuscleFibers.Type.FR.APSF.Max=0.3;
    Parameters.data.MuscleFibers.Type.FR.APSF.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FR.APTF.Min=0.7;
    Parameters.data.MuscleFibers.Type.FR.APTF.Max=0.6;
    Parameters.data.MuscleFibers.Type.FR.APTF.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FR.APAT.Min=47;
    Parameters.data.MuscleFibers.Type.FR.APAT.Max=50;
    Parameters.data.MuscleFibers.Type.FR.APAT.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FR.MT.Min=0.123;  
    Parameters.data.MuscleFibers.Type.FR.MT.Max=0.294;
    Parameters.data.MuscleFibers.Type.FR.MT.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FR.MTTP.Min=73.5;
    Parameters.data.MuscleFibers.Type.FR.MTTP.Max=55.5;
    Parameters.data.MuscleFibers.Type.FR.MTTP.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FR.MTF.Min=0.491;  
    Parameters.data.MuscleFibers.Type.FR.MTF.Max=1.177;
    Parameters.data.MuscleFibers.Type.FR.MTF.Distribution='Linear Interpolation';
    Parameters.data.Motoneurons.FR.Soma.Radius.Min = 82.5;
    Parameters.data.Motoneurons.FR.Soma.Radius.Max = 87.5;
    Parameters.data.Motoneurons.FR.Soma.Radius.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.FR.Soma.Length.Min = 82.5;
    Parameters.data.Motoneurons.FR.Soma.Length.Max = 87.5;
    Parameters.data.Motoneurons.FR.Soma.Length.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.FR.Dendrite.Radius.Min = 62.5;
    Parameters.data.Motoneurons.FR.Dendrite.Radius.Max = 83.5;
    Parameters.data.Motoneurons.FR.Dendrite.Radius.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.FR.Dendrite.Length.Min = 6.8;
    Parameters.data.Motoneurons.FR.Dendrite.Length.Max = 8.1;
    Parameters.data.Motoneurons.FR.Dendrite.Length.Distribution = 'Linear Interpolation';

    Parameters.data.MuscleFibers.Type.FF.APSF.Min=0.3;
    Parameters.data.MuscleFibers.Type.FF.APSF.Max=0.5;
    Parameters.data.MuscleFibers.Type.FF.APSF.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FF.APTF.Min=0.6;
    Parameters.data.MuscleFibers.Type.FF.APTF.Max=0.5;
    Parameters.data.MuscleFibers.Type.FF.APTF.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FF.APAT.Min=50;
    Parameters.data.MuscleFibers.Type.FF.APAT.Max=53;
    Parameters.data.MuscleFibers.Type.FF.APAT.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FF.MT.Min=0.294;  
    Parameters.data.MuscleFibers.Type.FF.MT.Max=0.491;
    Parameters.data.MuscleFibers.Type.FF.MT.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FF.MTTP.Min=82.3;
    Parameters.data.MuscleFibers.Type.FF.MTTP.Max=56.9;
    Parameters.data.MuscleFibers.Type.FF.MTTP.Distribution='Linear Interpolation';
    Parameters.data.MuscleFibers.Type.FF.MTF.Min=1.177;  
    Parameters.data.MuscleFibers.Type.FF.MTF.Max=1.962;
    Parameters.data.MuscleFibers.Type.FF.MTF.Distribution='Linear Interpolation';
    Parameters.data.Motoneurons.FF.Soma.Radius.Min = 87.5;
    Parameters.data.Motoneurons.FF.Soma.Radius.Max = 113;
    Parameters.data.Motoneurons.FF.Soma.Radius.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.FF.Soma.Length.Min = 87.5;
    Parameters.data.Motoneurons.FF.Soma.Length.Max = 113;
    Parameters.data.Motoneurons.FF.Soma.Length.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.FF.Dendrite.Radius.Min = 83.5;
    Parameters.data.Motoneurons.FF.Dendrite.Radius.Max = 92.5;
    Parameters.data.Motoneurons.FF.Dendrite.Radius.Distribution = 'Linear Interpolation';
    Parameters.data.Motoneurons.FF.Dendrite.Length.Min = 8.1;
    Parameters.data.Motoneurons.FF.Dendrite.Length.Max = 10.6;
    Parameters.data.Motoneurons.FF.Dendrite.Length.Distribution = 'Linear Interpolation';
 %% Type-S
    % Soma Radius
    switch (Parameters.data.Motoneurons.S.Soma.Radius.Distribution)
        case 'Gaussian Distribution'
            ds = Parameters.data.Motoneurons.S.Soma.Radius.Min + (Parameters.data.Motoneurons.S.Soma.Radius.Max - Parameters.data.Motoneurons.S.Soma.Radius.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ds = Parameters.data.Motoneurons.S.Soma.Radius.Min:1e-04:Parameters.data.Motoneurons.S.Soma.Radius.Max;
            ds = interp1(1:size(range_ds,2),range_ds,linspace(1,size(range_ds,2),Parameters.data.Motoneurons.S.Quantity));
    end
    Parameters.data.Motoneurons.S.Soma.Radius.Value=(ds./2).*1e-04; %um to cm

    % Dendrite Radius
    switch (Parameters.data.Motoneurons.S.Dendrite.Radius.Distribution)
        case 'Gaussian Distribution'
            dd = Parameters.data.Motoneurons.S.Dendrite.Radius.Min + (Parameters.data.Motoneurons.S.Dendrite.Radius.Max - Parameters.data.Motoneurons.S.Dendrite.Radius.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_dd = Parameters.data.Motoneurons.S.Dendrite.Radius.Min:1e-04:Parameters.data.Motoneurons.S.Dendrite.Radius.Max;
            dd = interp1(1:size(range_dd,2),range_dd,linspace(1,size(range_dd,2),Parameters.data.Motoneurons.S.Quantity));
    end
    Parameters.data.Motoneurons.S.Dendrite.Radius.Value=(dd./2).*1e-04; %um to cm

    % Soma Length
    switch (Parameters.data.Motoneurons.S.Soma.Length.Distribution)
        case 'Gaussian Distribution'
            ls = Parameters.data.Motoneurons.S.Soma.Length.Min + (Parameters.data.Motoneurons.S.Soma.Length.Max - Parameters.data.Motoneurons.S.Soma.Length.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ls = Parameters.data.Motoneurons.S.Soma.Length.Min:1e-04:Parameters.data.Motoneurons.S.Soma.Length.Max;
            ls = interp1(1:size(range_ls,2),range_ls,linspace(1,size(range_ls,2),Parameters.data.Motoneurons.S.Quantity));
    end
    Parameters.data.Motoneurons.S.Soma.Length.Value=ls.*1e-04; %um to cm

    % Dendrite Length
    switch (Parameters.data.Motoneurons.S.Dendrite.Length.Distribution)
        case 'Gaussian Distribution'
            ld = Parameters.data.Motoneurons.S.Dendrite.Length.Min + (Parameters.data.Motoneurons.S.Dendrite.Length.Max - Parameters.data.Motoneurons.S.Dendrite.Length.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ld = Parameters.data.Motoneurons.S.Dendrite.Length.Min:1e-04:Parameters.data.Motoneurons.S.Dendrite.Length.Max;
            ld = interp1(1:size(range_ld,2),range_ld,linspace(1,size(range_ld,2),Parameters.data.Motoneurons.S.Quantity));
    end
    Parameters.data.Motoneurons.S.Dendrite.Length.Value=ld.*0.1; % mm to cm

    % Soma Area
    switch (somaFormatArea)
        case 'Cilindric' 
            Parameters.data.Motoneurons.S.Soma.Area.Value = 2.*pi.*Parameters.data.Motoneurons.S.Soma.Radius.Value.*Parameters.data.Motoneurons.S.Soma.Length.Value;
        case 'Espheric'
            Parameters.data.Motoneurons.S.Soma.Area.Value = 4.*pi.*(Parameters.data.Motoneurons.S.Soma.Radius.Value.^2);
    end

    % Dendrite Area
    switch (dendriteFormatArea)
        case 'Cilindric' 
            Parameters.data.Motoneurons.S.Dendrite.Area.Value = 2.*pi.*Parameters.data.Motoneurons.S.Dendrite.Radius.Value.*Parameters.data.Motoneurons.S.Dendrite.Length.Value;
        case 'Espheric'
            Parameters.data.Motoneurons.S.Dendrite.Area.Value = 4.*pi.*(Parameters.data.Motoneurons.S.Dendrite.Radius.Value.^2);
    end
    Parameters.data.Motoneurons.S.Area = Parameters.data.Motoneurons.S.Soma.Area.Value./(Parameters.data.Motoneurons.S.Soma.Area.Value+Parameters.data.Motoneurons.S.Dendrite.Area.Value);

    % Action Potential Scale Factor
    switch (Parameters.data.MuscleFibers.Type.S.APSF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.S.APSF.Value = Parameters.data.MuscleFibers.Type.S.APSF.Min + (Parameters.data.MuscleFibers.Type.S.APSF.Max - Parameters.data.MuscleFibers.Type.S.APSF.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_PA = Parameters.data.MuscleFibers.Type.S.APSF.Min:1e-04:Parameters.data.MuscleFibers.Type.S.APSF.Max;
            Parameters.data.MuscleFibers.Type.S.APSF.Value = interp1(1:size(range_PA,2),range_PA,linspace(1,size(range_PA,2),Parameters.data.Motoneurons.S.Quantity));
    end

    % Action Potential Time Factor
    switch (Parameters.data.MuscleFibers.Type.S.APTF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.S.APTF.Value = Parameters.data.MuscleFibers.Type.S.APTF.Min + (Parameters.data.MuscleFibers.Type.S.APTF.Max - Parameters.data.MuscleFibers.Type.S.APTF.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_LambM = Parameters.data.MuscleFibers.Type.S.APTF.Min:-1e-04:Parameters.data.MuscleFibers.Type.S.APTF.Max;
            Parameters.data.MuscleFibers.Type.S.APTF.Value = interp1(1:size(range_LambM,2),range_LambM,linspace(1,size(range_LambM,2),Parameters.data.Motoneurons.S.Quantity));
    end

    % Action Potential Arrival Time
    switch (Parameters.data.MuscleFibers.Type.S.APAT.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.S.APAT.Value = Parameters.data.MuscleFibers.Type.S.APAT.Min + (Parameters.data.MuscleFibers.Type.S.APAT.Max - Parameters.data.MuscleFibers.Type.S.APAT.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tAP = Parameters.data.MuscleFibers.Type.S.APAT.Min:1e-04:Parameters.data.MuscleFibers.Type.S.APAT.Max;
            Parameters.data.MuscleFibers.Type.S.APAT.Value = interp1(1:size(range_tAP,2),range_tAP,linspace(1,size(range_tAP,2),Parameters.data.Motoneurons.S.Quantity));
    end
    Parameters.data.MuscleFibers.Type.S.APAT.Value = round(((compAxonal/100)./Parameters.data.MuscleFibers.Type.S.APAT.Value).*(Parameters.data.EENM.tmax/Parameters.data.EENM.step));

    % Muscle Twitch
    switch (Parameters.data.MuscleFibers.Type.S.MT.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.S.MT.Value = Parameters.data.MuscleFibers.Type.S.MT.Min + (Parameters.data.MuscleFibers.Type.S.MT.Max - Parameters.data.MuscleFibers.Type.S.MT.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_Apeak = Parameters.data.MuscleFibers.Type.S.MT.Min:1e-04:Parameters.data.MuscleFibers.Type.S.MT.Max;
            Parameters.data.MuscleFibers.Type.S.MT.Value = interp1(1:size(range_Apeak,2),range_Apeak,linspace(1,size(range_Apeak,2),Parameters.data.Motoneurons.S.Quantity));
    end

    % Muscle Twitch Time to Peak
    switch (Parameters.data.MuscleFibers.Type.S.MTTP.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.S.MTTP.Value = Parameters.data.MuscleFibers.Type.S.MTTP.Min + (Parameters.data.MuscleFibers.Type.S.MTTP.Max - Parameters.data.MuscleFibers.Type.S.MTTP.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tpeak = Parameters.data.MuscleFibers.Type.S.MTTP.Min:-1e-04:Parameters.data.MuscleFibers.Type.S.MTTP.Max;
            Parameters.data.MuscleFibers.Type.S.MTTP.Value = interp1(1:size(range_tpeak,2),range_tpeak,linspace(1,size(range_tpeak,2),Parameters.data.Motoneurons.S.Quantity));
    end

    %Muscle Tetanic Force
    switch (Parameters.data.MuscleFibers.Type.S.MTF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.S.MTF.Value = Parameters.data.MuscleFibers.Type.S.MTF.Min + (Parameters.data.MuscleFibers.Type.S.MTF.Max - Parameters.data.MuscleFibers.Type.S.MTF.Min)*sum(rand(Parameters.data.Motoneurons.S.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tetForce = Parameters.data.MuscleFibers.Type.S.MTF.Min:1e-04:Parameters.data.MuscleFibers.Type.S.MTF.Max;
            Parameters.data.MuscleFibers.Type.S.MTF.Value = interp1(1:size(range_tetForce,2),range_tetForce,linspace(1,size(range_tetForce,2),Parameters.data.Motoneurons.S.Quantity));
    end

    %% FR-Type
    % Soma Radius
    switch (Parameters.data.Motoneurons.FR.Soma.Radius.Distribution)
        case 'Gaussian Distribution'
            ds = Parameters.data.Motoneurons.FR.Soma.Radius.Min + (Parameters.data.Motoneurons.FR.Soma.Radius.Max - Parameters.data.Motoneurons.FR.Soma.Radius.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ds = Parameters.data.Motoneurons.FR.Soma.Radius.Min:1e-04:Parameters.data.Motoneurons.FR.Soma.Radius.Max;
            ds = interp1(1:size(range_ds,2),range_ds,linspace(1,size(range_ds,2),Parameters.data.Motoneurons.FR.Quantity));
    end
    Parameters.data.Motoneurons.FR.Soma.Radius.Value=(ds./2).*1e-04; %um to cm

    % Dendrite Radius
    switch (Parameters.data.Motoneurons.FR.Dendrite.Radius.Distribution)
        case 'Gaussian Distribution'
            dd = Parameters.data.Motoneurons.FR.Dendrite.Radius.Min + (Parameters.data.Motoneurons.FR.Dendrite.Radius.Max - Parameters.data.Motoneurons.FR.Dendrite.Radius.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_dd = Parameters.data.Motoneurons.FR.Dendrite.Radius.Min:1e-04:Parameters.data.Motoneurons.FR.Dendrite.Radius.Max;
            dd = interp1(1:size(range_dd,2),range_dd,linspace(1,size(range_dd,2),Parameters.data.Motoneurons.FR.Quantity));
    end
    Parameters.data.Motoneurons.FR.Dendrite.Radius.Value=(dd./2).*1e-04; %um to cm

    switch (Parameters.data.Motoneurons.FR.Soma.Length.Distribution)
        case 'Gaussian Distribution'
            ls = Parameters.data.Motoneurons.FR.Soma.Length.Min + (Parameters.data.Motoneurons.FR.Soma.Length.Max - Parameters.data.Motoneurons.FR.Soma.Length.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ls = Parameters.data.Motoneurons.FR.Soma.Length.Min:1e-04:Parameters.data.Motoneurons.FR.Soma.Length.Max;
            ls = interp1(1:size(range_ls,2),range_ls,linspace(1,size(range_ls,2),Parameters.data.Motoneurons.FR.Quantity));
    end
    Parameters.data.Motoneurons.FR.Soma.Length.Value=ls.*1e-04; %um to cm

    switch (Parameters.data.Motoneurons.FR.Dendrite.Length.Distribution)    
        case 'Gaussian Distribution'
            ld = Parameters.data.Motoneurons.FR.Dendrite.Length.Min + (Parameters.data.Motoneurons.FR.Dendrite.Length.Max - Parameters.data.Motoneurons.FR.Dendrite.Length.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ld = Parameters.data.Motoneurons.FR.Dendrite.Length.Min:1e-04:Parameters.data.Motoneurons.FR.Dendrite.Length.Max;
            ld = interp1(1:size(range_ld,2),range_ld,linspace(1,size(range_ld,2),Parameters.data.Motoneurons.FR.Quantity));
    end
    Parameters.data.Motoneurons.FR.Dendrite.Length.Value=ld.*0.1; % mm to cm

    switch (somaFormatArea)
        case 'Cilindric' 
            Parameters.data.Motoneurons.FR.Soma.Area.Value = 2.*pi.*Parameters.data.Motoneurons.FR.Soma.Radius.Value.*Parameters.data.Motoneurons.FR.Soma.Length.Value;
        case 'Espheric'
            Parameters.data.Motoneurons.FR.Soma.Area.Value = 4.*pi.*(Parameters.data.Motoneurons.FR.Soma.Radius.Value.^2);
    end

    switch (dendriteFormatArea)
        case 'Cilindric' 
            Parameters.data.Motoneurons.FR.Dendrite.Area.Value = 2.*pi.*Parameters.data.Motoneurons.FR.Dendrite.Radius.Value.*Parameters.data.Motoneurons.FR.Dendrite.Length.Value;
        case 'Espheric'
            Parameters.data.Motoneurons.FR.Dendrite.Area.Value = 4.*pi.*(Parameters.data.Motoneurons.FR.Dendrite.Radius.Value.^2);
    end

    Parameters.data.Motoneurons.FR.Area = Parameters.data.Motoneurons.FR.Soma.Area.Value./(Parameters.data.Motoneurons.FR.Soma.Area.Value+Parameters.data.Motoneurons.FR.Dendrite.Area.Value);

    switch (Parameters.data.MuscleFibers.Type.FR.APSF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FR.APSF.Value = Parameters.data.MuscleFibers.Type.FR.APSF.Min + (Parameters.data.MuscleFibers.Type.FR.APSF.Max - Parameters.data.MuscleFibers.Type.FR.APSF.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_PA = Parameters.data.MuscleFibers.Type.FR.APSF.Min:1e-04:Parameters.data.MuscleFibers.Type.FR.APSF.Max;
            Parameters.data.MuscleFibers.Type.FR.APSF.Value = interp1(1:size(range_PA,2),range_PA,linspace(1,size(range_PA,2),Parameters.data.Motoneurons.FR.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FR.APTF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FR.APTF.Value = Parameters.data.MuscleFibers.Type.FR.APTF.Min + (Parameters.data.MuscleFibers.Type.FR.APTF.Max - Parameters.data.MuscleFibers.Type.FR.APTF.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_LambM = Parameters.data.MuscleFibers.Type.FR.APTF.Min:-1e-04:Parameters.data.MuscleFibers.Type.FR.APTF.Max;
            Parameters.data.MuscleFibers.Type.FR.APTF.Value = interp1(1:size(range_LambM,2),range_LambM,linspace(1,size(range_LambM,2),Parameters.data.Motoneurons.FR.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FR.APAT.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FR.APAT.Value = Parameters.data.MuscleFibers.Type.FR.APAT.Min + (Parameters.data.MuscleFibers.Type.FR.APAT.Max - Parameters.data.MuscleFibers.Type.FR.APAT.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tAP = Parameters.data.MuscleFibers.Type.FR.APAT.Min:1e-04:Parameters.data.MuscleFibers.Type.FR.APAT.Max;
            Parameters.data.MuscleFibers.Type.FR.APAT.Value = interp1(1:size(range_tAP,2),range_tAP,linspace(1,size(range_tAP,2),Parameters.data.Motoneurons.FR.Quantity));
    end
    Parameters.data.MuscleFibers.Type.FR.APAT.Value = round(((compAxonal/100)./Parameters.data.MuscleFibers.Type.FR.APAT.Value).*(Parameters.data.EENM.tmax/Parameters.data.EENM.step));
    switch (Parameters.data.MuscleFibers.Type.FR.MT.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FR.MT.Value = Parameters.data.MuscleFibers.Type.FR.MT.Min + (Parameters.data.MuscleFibers.Type.FR.MT.Max - Parameters.data.MuscleFibers.Type.FR.MT.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_Apeak = Parameters.data.MuscleFibers.Type.FR.MT.Min:1e-04:Parameters.data.MuscleFibers.Type.FR.MT.Max;
            Parameters.data.MuscleFibers.Type.FR.MT.Value = interp1(1:size(range_Apeak,2),range_Apeak,linspace(1,size(range_Apeak,2),Parameters.data.Motoneurons.FR.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FR.MTTP.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FR.MTTP.Value = Parameters.data.MuscleFibers.Type.FR.MTTP.Min + (Parameters.data.MuscleFibers.Type.FR.MTTP.Max - Parameters.data.MuscleFibers.Type.FR.MTTP.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tpeak = Parameters.data.MuscleFibers.Type.FR.MTTP.Min:-1e-04:Parameters.data.MuscleFibers.Type.FR.MTTP.Max;
            Parameters.data.MuscleFibers.Type.FR.MTTP.Value = interp1(1:size(range_tpeak,2),range_tpeak,linspace(1,size(range_tpeak,2),Parameters.data.Motoneurons.FR.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FR.MTF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FR.MTF.Value = Parameters.data.MuscleFibers.Type.FR.MTF.Min + (Parameters.data.MuscleFibers.Type.FR.MTF.Max - Parameters.data.MuscleFibers.Type.FR.MTF.Min)*sum(rand(Parameters.data.Motoneurons.FR.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tetForce = Parameters.data.MuscleFibers.Type.FR.MTF.Min:1e-04:Parameters.data.MuscleFibers.Type.FR.MTF.Max;
            Parameters.data.MuscleFibers.Type.FR.MTF.Value = interp1(1:size(range_tetForce,2),range_tetForce,linspace(1,size(range_tetForce,2),Parameters.data.Motoneurons.FR.Quantity));
    end

    %% FF-Type
    %
    switch (Parameters.data.Motoneurons.FF.Soma.Radius.Distribution)
        case 'Gaussian Distribution'
            ds = Parameters.data.Motoneurons.FF.Soma.Radius.Min + (Parameters.data.Motoneurons.FF.Soma.Radius.Max - Parameters.data.Motoneurons.FF.Soma.Radius.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ds = Parameters.data.Motoneurons.FF.Soma.Radius.Min:1e-04:Parameters.data.Motoneurons.FF.Soma.Radius.Max;
            ds = interp1(1:size(range_ds,2),range_ds,linspace(1,size(range_ds,2),Parameters.data.Motoneurons.FF.Quantity));
    end
    Parameters.data.Motoneurons.FF.Soma.Radius.Value=(ds./2).*1e-04; %um to cm

    switch (Parameters.data.Motoneurons.FF.Dendrite.Radius.Distribution)
        case 'Gaussian Distribution'
            dd = Parameters.data.Motoneurons.FF.Dendrite.Radius.Min + (Parameters.data.Motoneurons.FF.Dendrite.Radius.Max - Parameters.data.Motoneurons.FF.Dendrite.Radius.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_dd = Parameters.data.Motoneurons.FF.Dendrite.Radius.Min:1e-04:Parameters.data.Motoneurons.FF.Dendrite.Radius.Max;
            dd = interp1(1:size(range_dd,2),range_dd,linspace(1,size(range_dd,2),Parameters.data.Motoneurons.FF.Quantity));
    end
    Parameters.data.Motoneurons.FF.Dendrite.Radius.Value=(dd./2).*1e-04; %um to cm

    switch (Parameters.data.Motoneurons.FF.Soma.Length.Distribution)
        case 'Gaussian Distribution'
            ls = Parameters.data.Motoneurons.FF.Soma.Length.Min + (Parameters.data.Motoneurons.FF.Soma.Length.Max - Parameters.data.Motoneurons.FF.Soma.Length.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ls = Parameters.data.Motoneurons.FF.Soma.Length.Min:1e-04:Parameters.data.Motoneurons.FF.Soma.Length.Max;
            ls = interp1(1:size(range_ls,2),range_ls,linspace(1,size(range_ls,2),Parameters.data.Motoneurons.FF.Quantity));
    end
    Parameters.data.Motoneurons.FF.Soma.Length.Value=ls.*1e-04; %um to cm

    switch (Parameters.data.Motoneurons.FF.Dendrite.Length.Distribution)
        case 'Gaussian Distribution'
            ld = Parameters.data.Motoneurons.FF.Dendrite.Length.Min + (Parameters.data.Motoneurons.FF.Dendrite.Length.Max - Parameters.data.Motoneurons.FF.Dendrite.Length.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_ld = Parameters.data.Motoneurons.FF.Dendrite.Length.Min:1e-04:Parameters.data.Motoneurons.FF.Dendrite.Length.Max;
            ld = interp1(1:size(range_ld,2),range_ld,linspace(1,size(range_ld,2),Parameters.data.Motoneurons.FF.Quantity));
    end
    Parameters.data.Motoneurons.FF.Dendrite.Length.Value=ld.*0.1; % mm to cm

    switch (somaFormatArea)
        case 'Cilindric' 
            Parameters.data.Motoneurons.FF.Soma.Area.Value = 2.*pi.*Parameters.data.Motoneurons.FF.Soma.Radius.Value.*Parameters.data.Motoneurons.FF.Soma.Length.Value;
        case 'Espheric'
            Parameters.data.Motoneurons.FF.Soma.Area.Value = 4.*pi.*(Parameters.data.Motoneurons.FF.Soma.Radius.Value.^2);
    end

    switch (dendriteFormatArea)
        case 'Cilindric' 
            Parameters.data.Motoneurons.FF.Dendrite.Area.Value = 2.*pi.*Parameters.data.Motoneurons.FF.Dendrite.Radius.Value.*Parameters.data.Motoneurons.FF.Dendrite.Length.Value;
        case 'Espheric'
            Parameters.data.Motoneurons.FF.Dendrite.Area.Value = 4.*pi.*(Parameters.data.Motoneurons.FF.Dendrite.Radius.Value.^2);
    end

    Parameters.data.Motoneurons.FF.Area = Parameters.data.Motoneurons.FF.Soma.Area.Value./(Parameters.data.Motoneurons.FF.Soma.Area.Value+Parameters.data.Motoneurons.FF.Dendrite.Area.Value);

    switch (Parameters.data.MuscleFibers.Type.FF.APSF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FF.APSF.Value = Parameters.data.MuscleFibers.Type.FF.APSF.Min + (Parameters.data.MuscleFibers.Type.FF.APSF.Max - Parameters.data.MuscleFibers.Type.FF.APSF.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_PA = Parameters.data.MuscleFibers.Type.FF.APSF.Min:1e-04:Parameters.data.MuscleFibers.Type.FF.APSF.Max;
            Parameters.data.MuscleFibers.Type.FF.APSF.Value = interp1(1:size(range_PA,2),range_PA,linspace(1,size(range_PA,2),Parameters.data.Motoneurons.FF.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FF.APTF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FF.APTF.Value = Parameters.data.MuscleFibers.Type.FF.APTF.Min + (Parameters.data.MuscleFibers.Type.FF.APTF.Max - Parameters.data.MuscleFibers.Type.FF.APTF.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_LambM = Parameters.data.MuscleFibers.Type.FF.APTF.Min:-1e-04:Parameters.data.MuscleFibers.Type.FF.APTF.Max;
            Parameters.data.MuscleFibers.Type.FF.APTF.Value = interp1(1:size(range_LambM,2),range_LambM,linspace(1,size(range_LambM,2),Parameters.data.Motoneurons.FF.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FF.APAT.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FF.APAT.Value = Parameters.data.MuscleFibers.Type.FF.APAT.Min + (Parameters.data.MuscleFibers.Type.FF.APAT.Max - Parameters.data.MuscleFibers.Type.FF.APAT.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tAP = Parameters.data.MuscleFibers.Type.FF.APAT.Min:1e-04:Parameters.data.MuscleFibers.Type.FF.APAT.Max;
            Parameters.data.MuscleFibers.Type.FF.APAT.Value = interp1(1:size(range_tAP,2),range_tAP,linspace(1,size(range_tAP,2),Parameters.data.Motoneurons.FF.Quantity));
    end
    Parameters.data.MuscleFibers.Type.FF.APAT.Value = round(((compAxonal/100)./Parameters.data.MuscleFibers.Type.FF.APAT.Value).*(Parameters.data.EENM.tmax/Parameters.data.EENM.step));
    switch (Parameters.data.MuscleFibers.Type.FF.MT.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FF.MT.Value = Parameters.data.MuscleFibers.Type.FF.MT.Min + (Parameters.data.MuscleFibers.Type.FF.MT.Max - Parameters.data.MuscleFibers.Type.FF.MT.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_Apeak = Parameters.data.MuscleFibers.Type.FF.MT.Min:1e-04:Parameters.data.MuscleFibers.Type.FF.MT.Max;
            Parameters.data.MuscleFibers.Type.FF.MT.Value = interp1(1:size(range_Apeak,2),range_Apeak,linspace(1,size(range_Apeak,2),Parameters.data.Motoneurons.FF.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FF.MTTP.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FF.MTTP.Value = Parameters.data.MuscleFibers.Type.FF.MTTP.Min + (Parameters.data.MuscleFibers.Type.FF.MTTP.Max - Parameters.data.MuscleFibers.Type.FF.MTTP.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tpeak = Parameters.data.MuscleFibers.Type.FF.MTTP.Min:-1e-04:Parameters.data.MuscleFibers.Type.FF.MTTP.Max;
            Parameters.data.MuscleFibers.Type.FF.MTTP.Value = interp1(1:size(range_tpeak,2),range_tpeak,linspace(1,size(range_tpeak,2),Parameters.data.Motoneurons.FF.Quantity));
    end

    switch (Parameters.data.MuscleFibers.Type.FF.MTF.Distribution)
        case 'Gaussian Distribution'
            Parameters.data.MuscleFibers.Type.FF.MTF.Value = Parameters.data.MuscleFibers.Type.FF.MTF.Min + (Parameters.data.MuscleFibers.Type.FF.MTF.Max - Parameters.data.MuscleFibers.Type.FF.MTF.Min)*sum(rand(Parameters.data.Motoneurons.FF.Quantity,p),2)/p; 
        case 'Linear Interpolation'
            range_tetForce = Parameters.data.MuscleFibers.Type.FF.MTF.Min:1e-04:Parameters.data.MuscleFibers.Type.FF.MTF.Max;
            Parameters.data.MuscleFibers.Type.FF.MTF.Value = interp1(1:size(range_tetForce,2),range_tetForce,linspace(1,size(range_tetForce,2),Parameters.data.Motoneurons.FF.Quantity));
    end
    
    %% Model parameters
    Parameters.data.Motoneurons.Conductances.vna=115.0;
    Parameters.data.Motoneurons.Conductances.vk=-20.0;
    Parameters.data.Motoneurons.Conductances.vl=0.0;
    Parameters.data.Motoneurons.Conductances.vca=140.0;
    Parameters.data.Motoneurons.Conductances.vrest=-60.0; 
    Parameters.data.Motoneurons.Conductances.gls = 0.51;
    Parameters.data.Motoneurons.Conductances.gld = 0.51;
    Parameters.data.Motoneurons.Conductances.Cd  = 1.0;
    Parameters.data.Motoneurons.Conductances.Cs  = 1.0;
    Parameters.data.Motoneurons.Conductances.gc  = 0.1;
    Parameters.data.Motoneurons.Conductances.p=1; 
    Parameters.data.Motoneurons.Conductances.kd=0.2; 
    Parameters.data.Motoneurons.Conductances.f=0.01; 
    Parameters.data.Motoneurons.Conductances.kca=2.0; 
    Parameters.data.Motoneurons.Conductances.alpha=0.009;
    % Soma parameters
    Parameters.data.Motoneurons.Conductances.sgna=80.0; 
    Parameters.data.Motoneurons.Conductances.sgk=100.0; 
    Parameters.data.Motoneurons.Conductances.sgca=14.0; 
    Parameters.data.Motoneurons.Conductances.camtau=4.0; 
    Parameters.data.Motoneurons.Conductances.cahtau=40.0; 
    Parameters.data.Motoneurons.Conductances.sgkca=6;
    % Dendrite parameters
    Parameters.data.Motoneurons.Conductances.dcastau=40.0; 
    Parameters.data.Motoneurons.Conductances.taunap=40; 
    Parameters.data.Motoneurons.Conductances.naptau=1000; 
    % Soma-dendrite coupling parameters
    Parameters.data.Motoneurons.Conductances.perkca=1.0; 
    % Parameters sensitive to SCI
    Parameters.data.Motoneurons.Conductances.dgkca=1.0; 
    Parameters.data.Motoneurons.Conductances.gnap=0.1; 
    Parameters.data.Motoneurons.Conductances.dgcas=0.25; 
    Parameters.data.Motoneurons.Conductances.alpha2=0.009; 
    Parameters.data.Motoneurons.Conductances.pernap=1;   
end


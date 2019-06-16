    %% Dendritic channel gating functions
    function ss_dcasinf = dcasinf(vd)
        dcasth=-39.0; dcasslp=7.0;
        ss_dcasinf=1.0/(1.0+exp(-(vd-dcasth)/dcasslp));
    end


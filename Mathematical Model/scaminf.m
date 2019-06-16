
    function ss_scaminf = scaminf(vs)
        camth=-30.0; camslp=5.0;
        ss_scaminf=1.0/(1.0+exp(-(vs-camth)/camslp));
    end


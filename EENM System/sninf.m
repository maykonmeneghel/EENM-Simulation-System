    function ss_sninf = sninf(vs)
        nth=-28.0; nslp=12.0;
        ss_sninf=1.0/(1.0+exp(-(vs-nth)/nslp));
    end


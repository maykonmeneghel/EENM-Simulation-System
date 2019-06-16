    function ss_sntau = sntau(vs)
        nv=-40.0; na=40.0; nb=50.0; nc=7.0;
        ss_sntau=nc/(exp((vs-nv)/na)+exp(-(vs-nv)/nb));
    end

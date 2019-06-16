    function ss_minfnap = minfnap(vd)
        thetamnap=-48; Kmnap=3;
        ss_minfnap=1/(1+exp(-(vd-thetamnap)/Kmnap));
    end


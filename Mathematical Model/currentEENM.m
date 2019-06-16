function [Parameters] = currentEENM(tmax, step, Fb, Wb, Amp, Type, MotoneuronType, ModulationType, ModulationWhere, tmed)

    Parameters.data.EENM.tmax = tmax;
    Parameters.data.EENM.step = step;
    Parameters.data.EENM.Fb = Fb /1000;
    Parameters.data.EENM.Wb = Wb;
    Parameters.data.EENM.Amp = Amp;
    Parameters.data.EENM.Type = Type;
    Parameters.data.EENM.MotoneuronType = MotoneuronType;
    Parameters.data.EENM.Modulation.Type = ModulationType;
    Parameters.data.EENM.Modulation.Where = ModulationWhere; 
    Parameters.data.EENM.Modulation.tmed = tmed;
    %Parameters.data.EENM.DelayTime = 0;
    
    Parameters.time = 0:Parameters.data.EENM.step:Parameters.data.EENM.tmax; 
    Parameters.data.EENM.IEENM=zeros(length(Parameters.time),1);
    for i=1:length(Parameters.time)
       Parameters.data.EENM.IEENM(i,1)=FES(Parameters.time(i),Parameters.data); 
    end
end


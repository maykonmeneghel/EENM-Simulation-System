# PHYSIOLOGICALLY INSPIRED MATHEMATICAL MODEL OF THE NEUROMUSCULAR APPARATUS ADAPTED TO CHRONIC MEDULAR INJURY

In the proposed neuromuscular model, it is assumed that (i) there are three different types of motoneurons: slow, fast and fatigue resistant and fast and easily fatiguable, (ii) each motoneuron has two cylindrical compartments and an axon whose axonal segment is represented by a cylindrical handle, (iii) each motor axon conducts an action potential of the sum compartment to the neuromotor junction with attenuated tension proportional to the length of the axonal segment, (iv) the muscle is considered as a single muscle fiber and therefore the potentiate of action of the muscle fiber equals the action potential of the motor unit, (v) the action potential peaks that arrive at a motor unit shape the muscular force and (vi) the muscular concussion produced in the motor unit, depends only on the properties of the fibers muscles.

The neuromuscular model was constructed considering five processes (according to Figure 16), being: (i) the generation of action potential in the cell membrane of the motoneurons physiologically inspired in the ionic conductances of rats with chronic spinal cord injury (VENUGOPAL; ), (ii) the propagation of this action potential along the axonal segment until the end of the neuromotor junction (ANTONI et al., 1998; HINES, CARNEVALE, 1997; KOCH, 1984); (CISI; KOHN, 2008; ELIAS; WATANABE; KOHN, 2014), (iv) muscle contraction mediated by uptake and release of Ca 2+ in the muscle and (v) the production of muscle strength resulting from the temporal convolution between the contraction peaks and the firing of the action potentials of the motor units (CISI; KOHN, 2008)

The simulator has the following functionalities: (i) to configure the working muscle considering the characteristics of the motoneurons and the composition of the muscular fibers, such as different types of geometric properties of the motoneurons, and factors of scale and time of PAUM, time and amplitude of (ii) to select the parameters of electrical stimulation as frequencies, work cycles and amplitudes of the stimulus pulses, modulation signals, temperature of the motoneurons and the phasic nature of the electrical stimulation current and ( iii) to draw muscle force curves resulting from the application of electrical stimulation in the compartments of the motoneurons.

To learn more about the internal components of the simulator, go to:

- <under construction>
- <under construction>

# EENM _Simulation System_

## In this link is the neuromuscular model that simulates the application of neuromuscular electrical stimulation in a model suitable for chronic spinal cord injury:
- <under construction>

### Instructions of the mathematical model:
  - Run the _Main.m_ file
  
## In this link is the simulator system with graphical interface:
- <under construction>

### Instructions of the simulation system:
  - Run the _app1.mlapp_ file
  
## Here it is possible to download the simulator in stand alone mode:
- <under construction>
  
## Here you can find the simulator in "application for MATLAB" mode:
- <under construction>
  
## Screenshots
- ![Home screen](https://github.com/maykonmeneghel/EENM-Simulation-System/tree/master/Images/1.JPG)
- ![Configuration of motoneurons](https://github.com/maykonmeneghel/EENM-Simulation-System/tree/master/Images/2.JPG)
- ![Configuration of muscle properties](https://github.com/maykonmeneghel/EENM-Simulation-System/tree/master/Images/3.JPG)
- ![Simulation screen](https://github.com/maykonmeneghel/EENM-Simulation-System/tree/master/Images/4.JPG)
- ![Results screen](https://github.com/maykonmeneghel/EENM-Simulation-System/tree/master/Images/5.JPG)

# Problems:
- The time to simulate 1 second is around 5 minutes. Some equations could be optimized, although the highest computational cost is in the Hodgkin and Huxley model, which if replaced is no longer physiologically inspired.

- The application is being simulated, applying currents at the level of the spinal cord, could arise a variation where the stimulus would start in the axonal segment.

- A physiological representation of muscle fatigue could be introduced into the model, since it is one of the main objectives to be avoided during the application of electrical stimuli.

- There is no clinical evidence to prove that this system can be applied for actual use. Here I present only a suggestion of a mathematical model of the neuromuscular apparatus compatible with chronic spinal cord injury which, if perfected, may replace the use of force sensors that are generally used to feedback a controller that generates electrical stimuli in the spinal cord motoneurons, with feedback are usually found in hybrid neuropho- theses that have neuromuscular electrical stimulation.

**You can contribute to this template by cloning the repository and creating new versions.**

# Appeal:
We will contribute because while medicine works to cure the spinal cord injury, it is up to us engineers, developers and researchers to design solutions so that these individuals can be rehabilitated.

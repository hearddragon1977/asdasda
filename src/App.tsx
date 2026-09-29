import { useState, useCallback, useEffect, useRef } from 'react';
import { TacticalViewport } from './components/TacticalViewport';
import { ScoreboardModal } from './components/ScoreboardModal';
import { TopoMapModal } from './components/TopoMapModal';
import { PauseMenuModal } from './components/PauseMenuModal';
import { CasevacSequence } from './components/CasevacSequence';
import { RosterModal } from './components/RosterModal';
import { InventoryModal } from './components/InventoryModal';

import {
  AnatomicalWound,
  EnemyCombatant,
  FriendlyCombatant,
  PlayerVitals,
  WeaponState,
  InventoryState,
  CasevacState,
  OperatorRecord,
} from './types/game';

import { anatomySim } from './game/anatomySimulation';
import { aiDirector } from './game/aiGoap';
import { rosterManager } from './game/rosterSystem';
import { tacticalAudio } from './audio/tacticalAudio';
import { createDefaultInventory, getActiveWeaponState, replenishInventoryAmmo, switchWeaponSlot, syncWeaponIntoInventory } from './data/inventory.js';
import { DEFAULT_PLAYER_WEAPON, getWeaponById } from './data/weapons.js';
import { equipmentManager, playerEquipment } from './systems/equipment.js';
import { AuthProvider, useAuth } from './firebase/AuthContext';
import {
  CasualtyReportRecord,
  saveCasualtyReportToFirestore,
  saveOperatorToFirestore,
  subscribeToCasualtyReports,
  subscribeToUserOperators,
} from './firebase/firestoreService';

function TacticalAppContent() {
  const { user, signInWithGoogle } = useAuth();

  // God Mode state
  const [godMode, setGodMode] = useState<boolean>(false);

  // Simulation Pause state
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Player physiological & anatomical state (Strictly hidden during combat per hardcore zero-HUD rules!)
  const [vitals, setVitals] = useState<PlayerVitals>(anatomySim.vitals);
  const [, setWounds] = useState<AnatomicalWound[]>(anatomySim.wounds);

  // Live Entity States for Real Scoreboard & Real Radar Map
  const [cityMapImage, setCityMapImage] = useState<string | null>(null);
  const [playerPos, setPlayerPos] = useState<{ x: number; z: number; rotationY: number }>({
    x: 0,
    z: 0,
    rotationY: 0,
  });
  const [friendlies, setFriendlies] = useState<FriendlyCombatant[]>(aiDirector.friendlies);
  const [enemies, setEnemies] = useState<EnemyCombatant[]>(aiDirector.enemies);
  const [currentWave, setCurrentWave] = useState<number>(aiDirector.currentWave);

  // Scoreboard, Kills, and Combat Feed
  const [playerKills, setPlayerKills] = useState<number>(0);
  const [playerDeaths, setPlayerDeaths] = useState<number>(0);
  const [killFeed, setKillFeed] = useState<string[]>([
    'Joint Task Force inserted into Sector 44-B',
    'Bluefor fireteam deployed in wedge formation',
    'OPFOR insurgents advancing through perimeter berms',
  ]);

  const [inventory, setInventory] = useState<InventoryState>(() => createDefaultInventory());
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [weapon, setWeapon] = useState<WeaponState>(() =>
    playerEquipment.applyToWeaponState(getActiveWeaponState(createDefaultInventory())) as WeaponState
  );
  const weaponLive = useRef(weapon);
  const inventoryLive = useRef(inventory);
  weaponLive.current = weapon;
  inventoryLive.current = inventory;

  // CASEVAC 9-Line State
  const [casevac, setCasevac] = useState<CasevacState>({
    status: 'idle',
    smokeDeployed: false,
    progress: 0,
    message: '',
    squadMembers: [],
  });

  // Operator dossier & roster
  const [activeOperator, setActiveOperator] = useState<OperatorRecord>(rosterManager.activeOperator);
  const [cloudReports, setCloudReports] = useState<CasualtyReportRecord[]>([]);

  // Modals
  const [isScoreboardOpen, setIsScoreboardOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const overlaysLive = useRef({ isInventoryOpen, isRosterOpen, isScoreboardOpen, isMapOpen });
  overlaysLive.current = { isInventoryOpen, isRosterOpen, isScoreboardOpen, isMapOpen };

  // Toggle God Mode
  const handleToggleGodMode = useCallback(() => {
    setGodMode((prev) => !prev);
  }, []);

  const applyLoadout = useCallback((next: { inventory: InventoryState; weapon: WeaponState }) => {
    if (next.inventory.helmetId) playerEquipment.equip(next.inventory.helmetId);
    else playerEquipment.unequip('helmet');
    if (next.inventory.vestId) playerEquipment.equip(next.inventory.vestId);
    else playerEquipment.unequip('vest');
    if (next.inventory.backpackId) playerEquipment.equip(next.inventory.backpackId);
    else playerEquipment.unequip('backpack');
    setInventory(next.inventory);
    setWeapon(playerEquipment.applyToWeaponState(next.weapon) as WeaponState);
  }, []);

  const openInventory = useCallback(() => {
    setInventory(syncWeaponIntoInventory(inventoryLive.current, weaponLive.current));
    setIsInventoryOpen(true);
  }, []);

  // Global key bindings: 'G' for God mode, 'Tab' for the pause menu, 'M' for Map, 'I' for inventory,
  // 'Escape' closes the topmost panel (inventory, roster, scoreboard, map) or else toggles pause
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') {
        handleToggleGodMode();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        setIsPauseMenuOpen((prev) => {
          const next = !prev;
          setIsPaused(next);
          return next;
        });
      }
      if (e.key === 'm' || e.key === 'M') {
        setIsMapOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        const open = overlaysLive.current;
        if (open.isInventoryOpen) return setIsInventoryOpen(false);
        if (open.isRosterOpen) return setIsRosterOpen(false);
        if (open.isScoreboardOpen) return setIsScoreboardOpen(false);
        if (open.isMapOpen) return setIsMapOpen(false);
        setIsPauseMenuOpen((prev) => {
          const next = !prev;
          setIsPaused(next);
          return next;
        });
      }
      if (e.key === 'i' || e.key === 'I') {
        if (overlaysLive.current.isInventoryOpen) setIsInventoryOpen(false);
        else openInventory();
      }
      if (e.key === '1' || e.key === '2') {
        const swapped = switchWeaponSlot(
          inventoryLive.current,
          weaponLive.current,
          e.key === '1' ? 'primary' : 'sidearm'
        );
        if (swapped) applyLoadout(swapped);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [handleToggleGodMode, applyLoadout, openInventory]);

  // Firebase Real-time Synchronization
  useEffect(() => {
    if (!user) return;

    saveOperatorToFirestore(activeOperator, user.uid).catch(() => {});

    const unsubReports = subscribeToCasualtyReports(user.uid, (reports) => {
      setCloudReports(reports);
    });

    const unsubOperators = subscribeToUserOperators(user.uid, (operators) => {
      if (operators.length > 0) {
        const current = operators.find((o) => o.status === 'active') || operators[0];
        if (current && current.id !== activeOperator.id) {
          setActiveOperator(current);
          rosterManager.activeOperator = current;
        }
      }
    });

    return () => {
      unsubReports();
      unsubOperators();
    };
  }, [user]);

  // Synchronize vitals from simulation loop
  const handleVitalsChanged = useCallback(() => {
    setVitals({ ...anatomySim.vitals });
    const uniqueMap = new Map<string, AnatomicalWound>();
    for (const w of anatomySim.wounds) {
      if (!uniqueMap.has(w.id)) {
        uniqueMap.set(w.id, w);
      }
    }
    setWounds(Array.from(uniqueMap.values()));

    // Check flatline if not in god mode (Casualty Report triggered upon death!)
    if (!godMode && anatomySim.vitals.shockStage === 'cardiac_arrest' && casevac.status === 'idle') {
      setPlayerDeaths((prev) => prev + 1);
      setKillFeed((prev) => [...prev, `${activeOperator.callsign} expired in action (Exsanguination)`]);

      setCasevac((prev) => ({
        ...prev,
        status: 'dia',
        message: 'Heart rate 0. Irreversible hypovolemic cardiac arrest.',
      }));

      if (user) {
        saveCasualtyReportToFirestore(
          {
            id: `dia-${Date.now()}`,
            userId: user.uid,
            operatorName: activeOperator.name,
            callsign: activeOperator.callsign,
            outcome: 'dia',
            finalBloodVolume: 0,
            woundsCount: anatomySim.wounds.length,
            woundsSummary: anatomySim.wounds.map((w) => w.name),
            boardFindings: 'Killed In Action (KIA) - Complete Exsanguination and Brainstem Cessation.',
            createdAt: new Date().toISOString(),
          },
          user.uid
        ).catch(() => {});
      }
    }
  }, [casevac.status, user, activeOperator, godMode]);

  // Real Kill Attribution callback
  const handleEnemyEliminated = (enemyId: string, shooterId: string) => {
    const enemy = aiDirector.enemies.find((e) => e.id === enemyId);
    const enemyName = enemy ? `${enemy.callsign}` : 'hostile';

    if (shooterId === 'player') {
      setPlayerKills((prev) => prev + 1);
      setKillFeed((prev) => [
        ...prev,
        `${activeOperator.callsign} neutralized ${enemyName} with ${(getWeaponById(weapon.weaponId) ?? DEFAULT_PLAYER_WEAPON).shortName}`,
      ]);
    } else {
      const friendly = aiDirector.friendlies.find((f) => f.id === shooterId);
      const friendlyName = friendly ? friendly.callsign : 'Bluefor';
      setKillFeed((prev) => [
        ...prev,
        `${friendlyName} neutralized ${enemyName}`,
      ]);
    }
    setEnemies([...aiDirector.enemies]);
    setFriendlies([...aiDirector.friendlies]);
    setCurrentWave(aiDirector.currentWave);
  };

  const handleFriendlyDown = (friendlyId: string, killerId: string) => {
    const friendly = aiDirector.friendlies.find((f) => f.id === friendlyId);
    const enemy = aiDirector.enemies.find((e) => e.id === killerId);
    const fName = friendly ? friendly.callsign : 'Friendly';
    const eName = enemy ? enemy.callsign : 'Hostile';

    setKillFeed((prev) => [...prev, `${fName} was neutralized by ${eName}`]);
    setFriendlies([...aiDirector.friendlies]);
    setEnemies([...aiDirector.enemies]);
  };

  const handleSquadSync = (fList: FriendlyCombatant[], eList: EnemyCombatant[]) => {
    setFriendlies([...fList]);
    setEnemies([...eList]);
    setCurrentWave(aiDirector.currentWave);
  };

  const handleResetTrauma = () => {
    anatomySim.reset();
    setCasevac({
      status: 'idle',
      smokeDeployed: false,
      progress: 0,
      message: '',
      squadMembers: [],
    });
    // Respawn Friendly AI squad on BLUEFOR staging pad with full combat readiness
    aiDirector.spawnFriendlySquad();
    setFriendlies([...aiDirector.friendlies]);
    equipmentManager.resetPlayer();
    const replenished = replenishInventoryAmmo(inventoryLive.current);
    applyLoadout(replenished);
    handleVitalsChanged();
  };

  // --- AI CASEVAC EXTRACTION PROTOCOL ---
  const handleCallCasevac = () => {
    if (casevac.status !== 'idle') return;
    tacticalAudio.init();
    tacticalAudio.playRadioSquelchChirp();

    setCasevac({
      status: 'calling',
      smokeDeployed: false,
      progress: 10,
      message: 'Transmitting 9-Line MEDEVAC request: Urgent surgical casualty...',
      squadMembers: [],
    });

    setTimeout(() => {
      tacticalAudio.playRadioSquelchChirp();
      setCasevac((prev) => ({
        ...prev,
        status: 'inbound',
        smokeDeployed: true,
        progress: 40,
        message: 'Dustoff-4 inbound. Marked LZ with green smoke flare! Keep perimeter clear.',
      }));
    }, 2800);

    setTimeout(() => {
      tacticalAudio.playRadioSquelchChirp();
      setCasevac((prev) => ({
        ...prev,
        status: 'arrived',
        progress: 70,
        message: 'Dustoff-4 boots on ground! Security team laying down suppressive fire. Medic moving to casualty!',
      }));
    }, 6000);

    setTimeout(() => {
      tacticalAudio.playRadioSquelchChirp();
      const outcome = rosterManager.processCasualtyOutcome(
        anatomySim.vitals,
        anatomySim.wounds.length,
        anatomySim.wounds.map((w) => w.name),
        true
      );

      // CASUALTY TRIAGE SCAN: Only evacuate wounded or dead, NOT healthy live people!
      const evacuated: {
        id: string;
        name: string;
        callsign: string;
        status: 'WIA' | 'KIA';
        injurySummary: string;
      }[] = [];

      const retained: {
        id: string;
        callsign: string;
        role: string;
        health: number;
      }[] = [];

      // Check Player Status
      const playerIsDia = vitals.shockStage === 'cardiac_arrest';
      const playerIsWia =
        !playerIsDia &&
        (vitals.bloodVolume < 4900 || anatomySim.wounds.length > 0 || vitals.paralyzed);

      if (playerIsDia) {
        evacuated.push({
          id: 'player',
          name: `${activeOperator.rank} ${activeOperator.name}`,
          callsign: activeOperator.callsign,
          status: 'KIA',
          injurySummary: 'Fatal exsanguination / cardiac cessation',
        });
      } else if (playerIsWia) {
        evacuated.push({
          id: 'player',
          name: `${activeOperator.rank} ${activeOperator.name}`,
          callsign: activeOperator.callsign,
          status: 'WIA',
          injurySummary: `${anatomySim.wounds.length} active wound(s), ${Math.round(vitals.bloodVolume)}mL blood`,
        });
      } else {
        retained.push({
          id: 'player',
          callsign: `${activeOperator.callsign} (YOU)`,
          role: 'Point Man',
          health: 100,
        });
      }

      // Check Friendly Squadmates
      aiDirector.friendlies.forEach((f) => {
        if (f.status === 'KIA') {
          evacuated.push({
            id: f.id,
            name: f.name,
            callsign: f.callsign,
            status: 'KIA',
            injurySummary: 'Killed in action by hostile fire',
          });
        } else if (f.status === 'WIA' || f.health < 100) {
          evacuated.push({
            id: f.id,
            name: f.name,
            callsign: f.callsign,
            status: 'WIA',
            injurySummary: `Severe ballistic trauma (${f.health}% integrity remaining)`,
          });
        } else {
          retained.push({
            id: f.id,
            callsign: f.callsign,
            role: f.role,
            health: f.health,
          });
        }
      });

      setCasevac((prev) => ({
        ...prev,
        status: 'extracted',
        progress: 100,
        message: outcome.reason,
        evacuatedCasualties: evacuated,
        retainedSecurity: retained,
      }));

      if (user) {
        saveCasualtyReportToFirestore(
          {
            id: `casevac-${Date.now()}`,
            userId: user.uid,
            operatorName: activeOperator.name,
            callsign: activeOperator.callsign,
            outcome: outcome.status === 'medically_discharged' ? 'extracted_discharged' : 'extracted_active',
            finalBloodVolume: Math.round(anatomySim.vitals.bloodVolume),
            woundsCount: anatomySim.wounds.length,
            woundsSummary: anatomySim.wounds.map((w) => w.name),
            boardFindings: outcome.reason,
            createdAt: new Date().toISOString(),
          },
          user.uid
        ).catch(() => {});
      }
    }, 9500);
  };

  const handleConfirmCasualtyOutcome = () => {
    if (vitals.shockStage === 'cardiac_arrest' || vitals.paralyzed || casevac.status === 'dia') {
      const nextOp = rosterManager.enlistNextRecruit();
      setActiveOperator(nextOp);
      if (user) {
        saveOperatorToFirestore(nextOp, user.uid).catch(() => {});
      }
    }
    handleResetTrauma();
  };

  const handleEnlistNewRecruit = () => {
    const nextOp = rosterManager.enlistNextRecruit();
    setActiveOperator(nextOp);
    if (user) {
      saveOperatorToFirestore(nextOp, user.uid).catch(() => {});
    }
    handleResetTrauma();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Top Header Bar */}
      <header className="h-12 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold font-display tracking-wider text-slate-100 uppercase">
            Tactical Trauma Simulator
          </span>
          <span className="hidden sm:inline text-xs font-mono text-emerald-400">
            · {(getWeaponById(weapon.weaponId) ?? DEFAULT_PLAYER_WEAPON).shortName} (
            {(getWeaponById(weapon.weaponId) ?? DEFAULT_PLAYER_WEAPON).fireRateRpm > 0
              ? `${(getWeaponById(weapon.weaponId) ?? DEFAULT_PLAYER_WEAPON).fireRateRpm} RPM`
              : 'SEMI'}
            ) · WAVE {currentWave}
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-4 text-xs font-mono text-slate-300">
          <button
            onClick={() => setIsScoreboardOpen(true)}
            className="hover:text-amber-400 transition-colors cursor-pointer"
          >
            Scoreboard
          </button>
          <span>·</span>
          <button
            onClick={() => setIsMapOpen(true)}
            className="hover:text-amber-400 transition-colors cursor-pointer"
          >
            Map [M]
          </button>
          <span>·</span>
          <button
            onClick={() => {
              setIsPauseMenuOpen(true);
              setIsPaused(true);
            }}
            className="hover:text-amber-400 transition-colors cursor-pointer text-sky-400 font-bold"
          >
            Menu [TAB]
          </button>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400 mr-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="truncate max-w-[110px]">{user.displayName || user.email}</span>
            </div>
          ) : (
            <button
              onClick={() => signInWithGoogle()}
              className="px-2 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/60 rounded cursor-pointer"
            >
              Sign In
            </button>
          )}

          <button
            onClick={() => setIsMapOpen(true)}
            className="px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded cursor-pointer"
          >
            MAP
          </button>

          <button
            onClick={() => setIsScoreboardOpen(true)}
            className="px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded cursor-pointer"
          >
            TEAMS
          </button>

          <button
            onClick={() => {
              setIsPauseMenuOpen(true);
              setIsPaused(true);
            }}
            className="px-3 py-1 text-xs font-mono bg-sky-600 hover:bg-sky-500 text-slate-950 font-bold rounded cursor-pointer"
          >
            PAUSE
          </button>
        </div>
      </header>

      {/* Main Full-Screen 3D Viewport (Zero-HUD: Health is NOT shown on screen during combat) */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        <TacticalViewport
          weapon={weapon}
          godMode={godMode}
          isPaused={isPaused}
          onToggleGodMode={handleToggleGodMode}
          onUpdateWeapon={setWeapon}
          onToggleMap={() => setIsMapOpen((prev) => !prev)}
          onCallCasevac={handleCallCasevac}
          onOpenRoster={() => setIsRosterOpen(true)}
          onOpenScoreboard={() => setIsScoreboardOpen(true)}
          onOpenPauseMenu={() => {
            setIsPauseMenuOpen(true);
            setIsPaused(true);
          }}
          onVitalsChanged={handleVitalsChanged}
          onEnemyEliminated={handleEnemyEliminated}
          onFriendlyDown={handleFriendlyDown}
          onPlayerPositionChanged={setPlayerPos}
          onSquadStateChanged={handleSquadSync}
          loadoutOpen={isInventoryOpen}
          onCityMapImage={setCityMapImage}
        />

        {/* AI CASEVAC 9-Line Extraction Panel & After-Action Report (Reveals health & trauma only upon extraction or DIA!) */}
        <CasevacSequence
          casevac={casevac}
          vitals={vitals}
          operator={activeOperator}
          onCallCasevac={handleCallCasevac}
          onConfirmCasualtyOutcome={handleConfirmCasualtyOutcome}
        />

        {/* Real Live Game Score List & Teams Modal */}
        <ScoreboardModal
          isOpen={isScoreboardOpen}
          onClose={() => setIsScoreboardOpen(false)}
          activeOperator={activeOperator}
          playerKills={playerKills}
          playerDeaths={playerDeaths}
          isPlayerAlive={vitals.shockStage !== 'cardiac_arrest'}
          friendlies={friendlies}
          enemies={enemies}
          currentWave={currentWave}
          killFeed={killFeed}
          equippedWeaponName={(getWeaponById(weapon.weaponId) ?? DEFAULT_PLAYER_WEAPON).shortName}
        />

        {/* Real Live Topographic Sector Map Modal */}
        <TopoMapModal
          isOpen={isMapOpen}
          overheadImage={cityMapImage}
          onClose={() => setIsMapOpen(false)}
          playerPos={playerPos}
          friendlies={friendlies}
          enemies={enemies}
        />

        {/* Tactical Pause Menu Modal */}
        <PauseMenuModal
          isOpen={isPauseMenuOpen}
          onResume={() => {
            setIsPauseMenuOpen(false);
            setIsPaused(false);
          }}
          onOpenScoreboard={() => setIsScoreboardOpen(true)}
          onOpenMap={() => setIsMapOpen(true)}
          onOpenRoster={() => setIsRosterOpen(true)}
          onCallCasevac={handleCallCasevac}
          onRestartMission={() => {
            setIsPauseMenuOpen(false);
            setIsPaused(false);
            handleResetTrauma();
            aiDirector.spawnInitialSquad();
            setFriendlies([...aiDirector.friendlies]);
            setEnemies([...aiDirector.enemies]);
            setCurrentWave(aiDirector.currentWave);
          }}
          godMode={godMode}
          onToggleGodMode={handleToggleGodMode}
          onOpenInventory={() => {
            setIsPauseMenuOpen(false);
            openInventory();
          }}
        />

        <InventoryModal
          isOpen={isInventoryOpen}
          onClose={() => setIsInventoryOpen(false)}
          inventory={inventory}
          weapon={weapon}
          onChangeLoadout={applyLoadout}
        />

        {/* Operator Personnel Dossier & Permadeath Memorial */}
        <RosterModal
          isOpen={isRosterOpen}
          onClose={() => setIsRosterOpen(false)}
          activeOperator={activeOperator}
          cloudCasualtyReports={cloudReports}
          onEnlistNewRecruit={handleEnlistNewRecruit}
        />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TacticalAppContent />
    </AuthProvider>
  );
}

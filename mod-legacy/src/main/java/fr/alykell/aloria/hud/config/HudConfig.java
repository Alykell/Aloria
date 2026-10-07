package fr.alykell.aloria.hud.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.module.HudModule;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * aloria-hud.json, au même format que le mod moderne : { "global": {...}, "visual": {...}, "modules": {...} }.
 * Lancé par Aloria, le fichier est commun à tous les profils et toutes les versions (-Daloriahud.config=…) :
 * les réglages faits en 1.8.9 se retrouvent en 1.21 et inversement.
 */
public final class HudConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = System.getProperty("aloriahud.config") != null
		? Paths.get(System.getProperty("aloriahud.config"))
		: FabricLoader.getInstance().getConfigDir().resolve("aloria-hud.json");
	private static final Type MODULES_TYPE = new TypeToken<Map<String, ModuleSettings>>() {}.getType();

	private GlobalSettings global = new GlobalSettings();
	private VisualSettings visual = new VisualSettings();
	private final Map<String, ModuleSettings> modules = new LinkedHashMap<>();
	/** Réglages des modules qui n'existent pas en 1.8.9 : gardés tels quels pour ne pas les perdre */
	private final Map<String, Object> otherModules = new LinkedHashMap<>();

	public static Path file() {
		return FILE;
	}

	public GlobalSettings global() {
		return global;
	}

	public VisualSettings visual() {
		return visual;
	}

	public ModuleSettings get(HudModule module) {
		ModuleSettings s = modules.get(module.id());
		if (s == null) {
			s = module.defaults();
			modules.put(module.id(), s);
		}
		return s;
	}

	public void reset(HudModule module) {
		modules.put(module.id(), module.defaults());
	}

	public static HudConfig load(List<HudModule> list) {
		HudConfig config = new HudConfig();
		if (Files.exists(FILE)) {
			try {
				String text = new String(Files.readAllBytes(FILE), StandardCharsets.UTF_8);
				JsonObject json = new JsonParser().parse(text).getAsJsonObject();
				if (json.has("global")) config.global = GSON.fromJson(json.get("global"), GlobalSettings.class);
				if (json.has("visual")) config.visual = GSON.fromJson(json.get("visual"), VisualSettings.class);
				if (json.has("modules")) {
					Map<String, ModuleSettings> read = GSON.fromJson(json.get("modules"), MODULES_TYPE);
					JsonObject raw = json.getAsJsonObject("modules");
					for (Map.Entry<String, ModuleSettings> e : read.entrySet()) {
						boolean known = false;
						for (HudModule m : list) known |= m.id().equals(e.getKey());
						if (known) config.modules.put(e.getKey(), e.getValue());
						else config.otherModules.put(e.getKey(), raw.get(e.getKey()));
					}
				}
			} catch (Exception e) {
				AloriaHud.LOGGER.warn("Configuration illisible, valeurs par défaut utilisées", e);
			}
		}
		for (HudModule m : list) config.get(m);
		return config;
	}

	public void save() {
		JsonObject json = new JsonObject();
		json.add("global", GSON.toJsonTree(global));
		json.add("visual", GSON.toJsonTree(visual));
		JsonObject mods = GSON.toJsonTree(modules, MODULES_TYPE).getAsJsonObject();
		for (Map.Entry<String, Object> e : otherModules.entrySet()) mods.add(e.getKey(), (com.google.gson.JsonElement) e.getValue());
		json.add("modules", mods);
		try {
			Files.createDirectories(FILE.getParent());
			// Écrit à côté puis remplace d'un coup : deux jeux ouverts ne laissent jamais un fichier à moitié écrit
			Path temp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
			Files.write(temp, GSON.toJson(json).getBytes(StandardCharsets.UTF_8));
			Files.move(temp, FILE, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			AloriaHud.LOGGER.error("Impossible d'enregistrer la configuration du HUD", e);
		}
	}
}

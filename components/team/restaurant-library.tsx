"use client";
import { useState } from "react";
import { Check, Plus, Trash2, Globe, Copy, ExternalLink } from "lucide-react";
import { canManage, type Restaurant } from "@/lib/restaurant-desk";
import type { useRestaurantDesk } from "@/hooks/use-restaurant-desk";

export function RestaurantLibrary({
  desk,
}: {
  desk: ReturnType<typeof useRestaurantDesk>;
}) {
  const data = desk.data!;
  const [restaurant, setRestaurant] = useState<Restaurant>(
      data.desk.restaurant,
    ),
    [version, setVersion] = useState(data.version),
    [savedBase, setSavedBase] = useState(JSON.stringify(data.desk.restaurant)),
    [notice, setNotice] = useState("");
  const editable = canManage(data.role);
  const remoteChanged = JSON.stringify(data.desk.restaurant) !== savedBase;
  async function save() {
    try {
      const result = await desk.perform(
        { type: "restaurant", restaurant },
        remoteChanged ? version : data.version,
      );
      setVersion(result.version);
      setRestaurant(result.desk.restaurant);
      setSavedBase(JSON.stringify(result.desk.restaurant));
      setNotice(
        restaurant.published
          ? "Restaurant information saved. The guest assistant is open."
          : "Restaurant information saved as a draft.",
      );
    } catch {
      setNotice("");
    }
  }
  function add() {
    setRestaurant({
      ...restaurant,
      facts: [
        ...restaurant.facts,
        {
          id: crypto.randomUUID(),
          category: "hours",
          title: "",
          text: "",
          approved: false,
        },
      ],
    });
  }
  function update(id: string, patch: Partial<Restaurant["facts"][number]>) {
    setRestaurant({
      ...restaurant,
      facts: restaurant.facts.map((fact) =>
        fact.id === id ? { ...fact, ...patch } : fact,
      ),
    });
  }
  const url =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/guest/${data.slug}`;
  const embed = `<script src="${typeof window === "undefined" ? "" : window.location.origin}/formbridge-widget.js" data-restaurant="${data.slug}" defer></script>`;
  return (
    <section>
      <div className="team-section-heading">
        <div>
          <p className="team-overline">THE RESTAURANT</p>
          <h2>Help guests feel at home.</h2>
          <p>
            Give the assistant information your team has checked and approved.
          </p>
        </div>
        {editable && (
          <button
            className="button primary"
            disabled={desk.busy}
            onClick={save}
          >
            <Check size={15} /> Save information
          </button>
        )}
      </div>
      {remoteChanged && (
        <div className="alert notice" role="status">
          <span>
            Restaurant information has changed since you opened this form.
          </span>
          <button
            className="text-button"
            onClick={() => {
              setRestaurant(data.desk.restaurant);
              setSavedBase(JSON.stringify(data.desk.restaurant));
              setVersion(data.version);
            }}
          >
            Reload saved information
          </button>
        </div>
      )}
      {!editable && (
        <p className="team-soft-note">
          An owner or manager can update the restaurant library.
        </p>
      )}
      <fieldset
        className="team-card restaurant-profile"
        disabled={!editable || desk.busy}
      >
        <legend>Restaurant details</legend>
        <div className="team-field-grid">
          <label>
            Name
            <input
              className="edit-input"
              value={restaurant.name}
              maxLength={80}
              onChange={(e) =>
                setRestaurant({ ...restaurant, name: e.target.value })
              }
            />
          </label>
          <label>
            City
            <input
              className="edit-input"
              value={restaurant.city}
              maxLength={80}
              onChange={(e) =>
                setRestaurant({ ...restaurant, city: e.target.value })
              }
            />
          </label>
          <label className="team-wide">
            Welcome message
            <textarea
              className="import-input"
              rows={2}
              value={restaurant.welcome}
              maxLength={300}
              onChange={(e) =>
                setRestaurant({ ...restaurant, welcome: e.target.value })
              }
            />
          </label>
        </div>
        <label className="team-check">
          <input
            type="checkbox"
            checked={restaurant.published}
            onChange={(e) =>
              setRestaurant({ ...restaurant, published: e.target.checked })
            }
          />
          <span>
            <strong>Open the website booking assistant</strong>
            <small>
              Publishing makes the restaurant details and approved information
              visible to guests.
            </small>
          </span>
        </label>
      </fieldset>
      <div className="team-inline-heading">
        <h3>Restaurant information</h3>
        {editable && (
          <button
            className="button subtle"
            disabled={restaurant.facts.length >= 30 || desk.busy}
            onClick={add}
          >
            <Plus size={15} /> Add information
          </button>
        )}
      </div>
      {!restaurant.facts.length && (
        <div className="team-empty">
          <Globe size={28} />
          <h3>A thoughtful welcome starts with good information.</h3>
          <p>
            Add your opening hours, menu, accessibility details or booking
            policies.
          </p>
        </div>
      )}
      <div className="knowledge-grid">
        {restaurant.facts.map((fact) => (
          <fieldset
            className="team-card knowledge-card"
            disabled={!editable || desk.busy}
            key={fact.id}
          >
            <div className="knowledge-top">
              <label>
                <span className="sr-only">Information category</span>
                <select
                  className="edit-input"
                  value={fact.category}
                  onChange={(e) =>
                    update(fact.id, {
                      category: e.target.value as typeof fact.category,
                    })
                  }
                >
                  <option value="hours">Opening hours</option>
                  <option value="menu">Menu and dietary information</option>
                  <option value="accessibility">Accessibility</option>
                  <option value="groups">Group dining</option>
                  <option value="policy">Booking policies</option>
                </select>
              </label>
              <button
                className="icon-button"
                aria-label={`Remove ${fact.title || "information"}`}
                onClick={() =>
                  setRestaurant({
                    ...restaurant,
                    facts: restaurant.facts.filter(
                      (item) => item.id !== fact.id,
                    ),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            <label>
              Title
              <input
                className="edit-input"
                value={fact.title}
                maxLength={80}
                placeholder="Dinner service"
                onChange={(e) => update(fact.id, { title: e.target.value })}
              />
            </label>
            <label>
              Information
              <textarea
                className="import-input"
                rows={4}
                value={fact.text}
                maxLength={1500}
                placeholder="Write the information exactly as you want guests to see it."
                onChange={(e) => update(fact.id, { text: e.target.value })}
              />
            </label>
            <label className="team-check">
              <input
                type="checkbox"
                checked={fact.approved}
                onChange={(e) =>
                  update(fact.id, { approved: e.target.checked })
                }
              />
              <span>Reviewed and approved for guests</span>
            </label>
          </fieldset>
        ))}
      </div>
      {data.desk.restaurant.published && (
        <div className="team-card guest-assistant-access">
          <Globe size={24} />
          <div>
            <h3>Your guest assistant is open.</h3>
            <p>
              Share the page or add the chat widget to your restaurant website.
            </p>
            <div className="team-action-row">
              <a
                className="button subtle"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                Open guest page <ExternalLink size={14} />
              </a>
              <button
                className="button subtle"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setNotice("Guest page link copied.");
                  } catch {
                    setNotice("Select the link below to copy it.");
                  }
                }}
              >
                <Copy size={14} /> Copy guest link
              </button>
            </div>
            <details>
              <summary>Add to your website</summary>
              <label className="sr-only" htmlFor="widget-code">
                Website widget code
              </label>
              <textarea
                id="widget-code"
                className="import-input"
                value={embed}
                readOnly
                rows={3}
              />
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(embed);
                    setNotice("Widget code copied.");
                  } catch {
                    setNotice("Select the code to copy it.");
                  }
                }}
              >
                Copy widget code
              </button>
              <p className="dialog-hint">
                Add this script before your website’s closing body tag. Your
                website must allow frames and scripts from FormBridge.
              </p>
            </details>
            <p className="team-url">{url}</p>
          </div>
        </div>
      )}
      {notice && (
        <p className="dialog-success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

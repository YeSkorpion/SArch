using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Studio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PlanningDepth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "change_packages",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "data_entities",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_entities", x => x.id);
                    table.ForeignKey(
                        name: "fk_data_entities_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "open_points",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    title = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    detail = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    artifact_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_open_points", x => x.id);
                    table.ForeignKey(
                        name: "fk_open_points_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "requirement_criteria",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    text = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    done = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_requirement_criteria", x => x.id);
                    table.ForeignKey(
                        name: "fk_requirement_criteria_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_requirement_criteria_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalTable: "requirements",
                        principalColumn: "artifact_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "service_contracts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    provider_id = table.Column<Guid>(type: "uuid", nullable: false),
                    consumer_id = table.Column<Guid>(type: "uuid", nullable: true),
                    operation = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    input = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    output = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    errors = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_service_contracts", x => x.id);
                    table.ForeignKey(
                        name: "fk_service_contracts_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "data_fields",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    field_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    required = table.Column<bool>(type: "boolean", nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_fields", x => x.id);
                    table.ForeignKey(
                        name: "fk_data_fields_data_entities_entity_id",
                        column: x => x.entity_id,
                        principalTable: "data_entities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_data_fields_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "data_uses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    artifact_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_uses", x => x.id);
                    table.ForeignKey(
                        name: "fk_data_uses_data_entities_entity_id",
                        column: x => x.entity_id,
                        principalTable: "data_entities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_data_uses_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_data_entities_project_id_name",
                table: "data_entities",
                columns: new[] { "project_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_data_fields_entity_id_position",
                table: "data_fields",
                columns: new[] { "entity_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_data_fields_project_id",
                table: "data_fields",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_data_uses_entity_id_artifact_id_role",
                table: "data_uses",
                columns: new[] { "entity_id", "artifact_id", "role" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_data_uses_project_id",
                table: "data_uses",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_open_points_project_id_status",
                table: "open_points",
                columns: new[] { "project_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_requirement_criteria_project_id",
                table: "requirement_criteria",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "ix_requirement_criteria_requirement_id_position",
                table: "requirement_criteria",
                columns: new[] { "requirement_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_service_contracts_project_id_name",
                table: "service_contracts",
                columns: new[] { "project_id", "name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "data_fields");

            migrationBuilder.DropTable(
                name: "data_uses");

            migrationBuilder.DropTable(
                name: "open_points");

            migrationBuilder.DropTable(
                name: "requirement_criteria");

            migrationBuilder.DropTable(
                name: "service_contracts");

            migrationBuilder.DropTable(
                name: "data_entities");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "change_packages");
        }
    }
}
